"""
SES inbound mail → S3 → this Lambda → YouTubeBooster /api/public/acq/inbound.

Parses From/Subject/body/Message-ID/In-Reply-To and posts a sanitized preview.
Does not invent prospect matches; correlation happens in the API.
"""
from __future__ import annotations

import email.utils
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from email import policy
from email.parser import BytesParser

import boto3

s3 = boto3.client("s3")
ssm = boto3.client("ssm")

API_BASE = (os.environ.get("YB_API_BASE") or "https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com").rstrip("/")
INBOUND_PATH = "/api/public/acq/inbound"
SSM_INBOUND_KEY = os.environ.get("YB_INBOUND_KEY_SSM", "/youtubebooster/outreach/inbound-key")
PREVIEW_MAX = 240

_cached_key = None


def _inbound_key() -> str:
    global _cached_key
    if _cached_key:
        return _cached_key
    res = ssm.get_parameter(Name=SSM_INBOUND_KEY, WithDecryption=True)
    _cached_key = (res.get("Parameter") or {}).get("Value") or ""
    if len(_cached_key) < 8:
        raise RuntimeError("inbound_key_missing")
    return _cached_key


def _extract_address(raw: str | None) -> str:
    if not raw:
        return ""
    name, addr = email.utils.parseaddr(raw)
    addr = (addr or "").strip().lower()
    if addr and "@" in addr:
        return addr
    m = re.search(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", raw or "", re.I)
    return (m.group(0) if m else "").strip().lower()


def _plain_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get_filename():
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode("utf-8", errors="ignore")
        for part in msg.walk():
            if part.get_content_type() == "text/html" and not part.get_filename():
                payload = part.get_payload(decode=True)
                if payload:
                    html = payload.decode("utf-8", errors="ignore")
                    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
                    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
                    text = re.sub(r"(?is)</p>", "\n", text)
                    text = re.sub(r"(?is)<.*?>", " ", text)
                    return re.sub(r"[ \t]+\n", "\n", re.sub(r"\s+", " ", text)).strip()
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode("utf-8", errors="ignore")
    return ""


def _preview(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return "(no preview)"
    # Drop quoted reply chains for the CRM preview.
    lines = []
    for line in t.splitlines():
        if line.startswith(">"):
            break
        if line.strip().lower().startswith("on ") and line.strip().endswith("wrote:"):
            break
        lines.append(line)
    compact = "\n".join(lines).strip() or t
    compact = re.sub(r"\s+", " ", compact).strip()
    if len(compact) > PREVIEW_MAX:
        return compact[: PREVIEW_MAX - 1] + "…"
    return compact


def _post_inbound(payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}{INBOUND_PATH}",
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "X-Outreach-Inbound-Key": _inbound_key(),
            "user-agent": "youtubebooster-inbound-mail/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read().decode("utf-8", errors="ignore")
            try:
                return json.loads(raw)
            except Exception:
                return {"ok": False, "raw": raw[:200]}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"inbound_http_{e.code}:{err[:300]}") from e


def process_object(bucket: str, key: str) -> dict:
    obj = s3.get_object(Bucket=bucket, Key=key)
    raw = obj["Body"].read()
    msg = BytesParser(policy=policy.default).parsebytes(raw)

    from_email = _extract_address(msg.get("From"))
    if not from_email:
        return {"ok": False, "error": "missing_from", "key": key}

    subject = msg.get("Subject") or "(no subject)"
    message_id = (msg.get("Message-ID") or msg.get("Message-Id") or "").strip() or None
    in_reply_to = (msg.get("In-Reply-To") or "").strip() or None
    preview = _preview(_plain_body(msg))

    result = _post_inbound(
        {
            "fromEmail": from_email,
            "subject": subject,
            "preview": preview,
            "messageId": message_id,
            "inReplyTo": in_reply_to,
        }
    )
    return {
        "ok": bool(result.get("ok")),
        "key": key,
        "fromEmailHost": from_email.split("@")[-1] if "@" in from_email else "",
        "matched": bool(result.get("prospectId")),
        "prospectId": result.get("prospectId"),
        "api": {k: result.get(k) for k in ("ok", "prospectId", "channel", "crmPath") if k in result},
    }


def lambda_handler(event, context):
    results = []
    for record in event.get("Records") or []:
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        results.append(process_object(bucket, key))
    return {"statusCode": 200, "body": json.dumps({"processed": len(results), "results": results})}
