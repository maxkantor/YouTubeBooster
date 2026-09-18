using System.Net;
using System.Text;

namespace YouTubeBoosterAi.Api;

public sealed record AcqMimeMessage(
    string FromHeader,
    string ReplyTo,
    string To,
    string Subject,
    string TextBody,
    string HtmlBody,
    string ListUnsubscribe,
    string RawRfc822,
    IReadOnlyDictionary<string, string> SesTags
);

public static class CreatorAcquisitionMail
{
    public static readonly string[] MojibakeNeedles =
    [
        "Â", "â€”", "â†’", "â€™", "â€œ", "â€\u009d"
    ];

    public static AcqMimeMessage Build(
        AcqProspectRecord prospect,
        AcqCampaignState state,
        string publicSiteUrl,
        string unsubscribeUrl,
        string trackedAbsoluteUrl)
    {
        var fromEmail = state.FromEmail!.Trim();
        var fromName = string.IsNullOrWhiteSpace(state.FromName) ? "Max from YouTubeBooster" : state.FromName.Trim();
        var replyTo = string.IsNullOrWhiteSpace(state.ReplyTo) ? fromEmail : state.ReplyTo.Trim();
        var to = prospect.PublicBusinessEmail!.Trim();
        var creator = string.IsNullOrWhiteSpace(prospect.ChannelName) ? prospect.Handle : prospect.ChannelName;
        var variant = OutreachPolicy.PersistVariant(prospect.EmailVariant, prospect.ProspectId);
        var (copySubject, copyBody) = CreatorAcquisitionCopy.Build(
            variant,
            creator,
            prospect.ChannelName,
            prospect.Observation ?? "",
            prospect.SuggestedImprovement ?? "",
            trackedAbsoluteUrl);
        var subject = string.IsNullOrWhiteSpace(prospect.Subject) ? copySubject : prospect.Subject.Trim();
        var text = CreatorAcquisitionCopy.WithComplianceFooter(copyBody, prospect.ChannelName, unsubscribeUrl, state.PostalAddress ?? "");
        var html = BuildHtmlFromText(copyBody, trackedAbsoluteUrl, prospect.ChannelName, unsubscribeUrl, state.PostalAddress ?? "", subject);

        foreach (var needle in MojibakeNeedles)
        {
            if (text.Contains(needle, StringComparison.Ordinal) || html.Contains(needle, StringComparison.Ordinal) || subject.Contains(needle, StringComparison.Ordinal))
                throw new InvalidOperationException("Email body contains mojibake and must not be sent.");
        }

        var boundary = "yb" + Guid.NewGuid().ToString("N");
        var fromHeader = $"{fromName} <{fromEmail}>";
        var listUnsub = $"<{unsubscribeUrl}>";
        var raw = BuildRaw(fromHeader, replyTo, to, subject, text, html, unsubscribeUrl, boundary);
        var tags = new Dictionary<string, string>
        {
            ["campaign"] = SanitizeTag(prospect.Campaign),
            ["purpose"] = "creator_acquisition",
            ["variant"] = SanitizeTag(variant),
            ["prospect_id"] = SanitizeTag(prospect.ProspectId),
            ["oid"] = SanitizeTag(prospect.OpaqueToken)
        };
        return new AcqMimeMessage(fromHeader, replyTo, to, subject, text, html, listUnsub, raw, tags);
    }

    public static string BuildHtmlFromText(
        string copyBody,
        string trackedUrl,
        string channelForFooter,
        string unsubscribeUrl,
        string postalAddress,
        string subject)
    {
        string E(string s) => WebUtility.HtmlEncode(s);
        var paras = copyBody.Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(p => p.Contains(trackedUrl, StringComparison.Ordinal)
                ? $"<p style=\"margin:0 0 16px;\"><a href=\"{E(trackedUrl)}\" style=\"display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;\">Open your free audit</a></p><p style=\"margin:0 0 16px;font-size:14px;color:#4b5563;\">{E(trackedUrl)}</p>"
                : $"<p style=\"margin:0 0 16px;\">{E(p).Replace("\n", "<br/>")}</p>");
        return $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>{{E(subject)}}</title>
            </head>
            <body style="margin:0;padding:0;background:#f8fafc;color:#111827;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;">
                <tr>
                  <td align="center" style="padding:24px 12px;">
                    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
                      <tr>
                        <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;">
                          {{string.Join("\n", paras)}}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
                          <p style="margin:0 0 8px;">You received this one-time business email because a contact address was publicly listed for {{E(channelForFooter)}}. YouTubeBooster AI is not affiliated with YouTube or Google.</p>
                          <p style="margin:0 0 8px;"><a href="{{E(unsubscribeUrl)}}" style="color:#374151;">Unsubscribe</a></p>
                          <p style="margin:0;">{{E(postalAddress)}}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """;
    }

    public static string BuildText(
        string greetingName,
        string channelName,
        string observation,
        string trackedUrl,
        string channelForFooter,
        string unsubscribeUrl,
        string postalAddress)
    {
        var (_, body) = CreatorAcquisitionCopy.Build("A", greetingName, channelName, observation, "", trackedUrl);
        return CreatorAcquisitionCopy.WithComplianceFooter(body, channelForFooter, unsubscribeUrl, postalAddress);
    }

    public static string BuildHtml(
        string greetingName,
        string channelName,
        string observation,
        string trackedUrl,
        string channelForFooter,
        string unsubscribeUrl,
        string postalAddress)
    {
        var (subject, body) = CreatorAcquisitionCopy.Build("A", greetingName, channelName, observation, "", trackedUrl);
        return BuildHtmlFromText(body, trackedUrl, channelForFooter, unsubscribeUrl, postalAddress, subject);
    }

    private static string BuildRaw(
        string fromHeader,
        string replyTo,
        string to,
        string subject,
        string text,
        string html,
        string unsubscribeUrl,
        string boundary)
    {
        var sb = new StringBuilder();
        sb.Append("From: ").Append(fromHeader).Append("\r\n");
        sb.Append("To: ").Append(to).Append("\r\n");
        sb.Append("Reply-To: ").Append(replyTo).Append("\r\n");
        sb.Append("Subject: ").Append(EncodeSubject(subject)).Append("\r\n");
        sb.Append("MIME-Version: 1.0\r\n");
        sb.Append("Content-Type: multipart/alternative; boundary=\"").Append(boundary).Append("\"\r\n");
        sb.Append("List-Unsubscribe: <").Append(unsubscribeUrl).Append(">\r\n");
        sb.Append("List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n");
        sb.Append("\r\n");
        sb.Append("--").Append(boundary).Append("\r\n");
        sb.Append("Content-Type: text/plain; charset=UTF-8\r\n");
        sb.Append("Content-Transfer-Encoding: 8bit\r\n\r\n");
        sb.Append(text.Replace("\n", "\r\n")).Append("\r\n");
        sb.Append("--").Append(boundary).Append("\r\n");
        sb.Append("Content-Type: text/html; charset=UTF-8\r\n");
        sb.Append("Content-Transfer-Encoding: 8bit\r\n\r\n");
        sb.Append(html.Replace("\n", "\r\n")).Append("\r\n");
        sb.Append("--").Append(boundary).Append("--\r\n");
        return sb.ToString();
    }

    public static string EncodeSubject(string subject)
    {
        var needs = subject.Any(c => c > 127);
        if (!needs) return subject;
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(subject));
        return $"=?UTF-8?B?{b64}?=";
    }

    public static string SanitizeTag(string value)
    {
        var cleaned = new string((value ?? "").Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
        if (cleaned.Length == 0) return "campaign";
        return cleaned.Length <= 256 ? cleaned : cleaned[..256];
    }

    public static bool TagsContainPii(IReadOnlyDictionary<string, string> tags) =>
        tags.Any(kv =>
            kv.Key.Contains("email", StringComparison.OrdinalIgnoreCase)
            || kv.Key.Contains("channel", StringComparison.OrdinalIgnoreCase)
            || EmailAddressHelpers.LooksLikeEmail(kv.Value)
            || kv.Value.Contains('@'));
}
