terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  common_tags = {
    Project     = "YouTubeBoosterAI"
    ManagedBy   = "Terraform"
    Environment = "prod"
  }

  amplify_seo_route_rules = [
    # Canonical path redirects.
    { source = "/audit-topics", target = "/audit", status = "301" },
    { source = "/audit-topics/<*>", target = "/audit/<*>", status = "301" },
    { source = "/privacy-policy", target = "/privacy", status = "301" },
    { source = "/why-your-youtube-channel-gets-no-views", target = "/why-your-channel-gets-no-views", status = "301" },
    { source = "/low-click-through-rate-youtube", target = "/low-ctr-on-youtube", status = "301" },
    { source = "/how-to-increase-youtube-watch-time", target = "/increase-youtube-watch-time", status = "301" },

    # Public SEO routes: serve generated static HTML before the SPA fallback.
    { source = "/demo", target = "/demo/index.html", status = "200" },
    { source = "/pricing", target = "/pricing/index.html", status = "200" },
    { source = "/faq", target = "/faq/index.html", status = "200" },
    { source = "/about", target = "/about/index.html", status = "200" },
    { source = "/contact", target = "/contact/index.html", status = "200" },
    { source = "/privacy", target = "/privacy/index.html", status = "200" },
    { source = "/disclaimer", target = "/disclaimer/index.html", status = "200" },
    { source = "/platform", target = "/platform/index.html", status = "200" },
    { source = "/audit", target = "/audit/index.html", status = "200" },
    { source = "/solutions", target = "/solutions/index.html", status = "200" },
    { source = "/guides", target = "/guides/index.html", status = "200" },
    { source = "/blog", target = "/blog/index.html", status = "200" },
    { source = "/site-map", target = "/site-map/index.html", status = "200" },
    { source = "/why-your-channel-gets-no-views", target = "/why-your-channel-gets-no-views/index.html", status = "200" },
    { source = "/how-to-get-more-youtube-views", target = "/how-to-get-more-youtube-views/index.html", status = "200" },
    { source = "/youtube-thumbnail-mistakes", target = "/youtube-thumbnail-mistakes/index.html", status = "200" },
    { source = "/low-ctr-on-youtube", target = "/low-ctr-on-youtube/index.html", status = "200" },
    { source = "/youtube-seo-for-small-channels", target = "/youtube-seo-for-small-channels/index.html", status = "200" },
    { source = "/free-youtube-channel-audit", target = "/free-youtube-channel-audit/index.html", status = "200" },
    { source = "/youtube-title-generator", target = "/youtube-title-generator/index.html", status = "200" },
    { source = "/increase-youtube-watch-time", target = "/increase-youtube-watch-time/index.html", status = "200" },
    { source = "/youtube-retention-analysis", target = "/youtube-retention-analysis/index.html", status = "200" },
    { source = "/youtube-thumbnail-ctr", target = "/youtube-thumbnail-ctr/index.html", status = "200" },
    { source = "/vidiq-alternative", target = "/vidiq-alternative/index.html", status = "200" },
    { source = "/tubebuddy-alternative", target = "/tubebuddy-alternative/index.html", status = "200" },
    { source = "/best-youtube-audit-tool", target = "/best-youtube-audit-tool/index.html", status = "200" },
    { source = "/compare/<*>", target = "/compare/<*>/index.html", status = "200" },
    { source = "/audit/<*>", target = "/audit/<*>/index.html", status = "200" },
    { source = "/solutions/<*>", target = "/solutions/<*>/index.html", status = "200" },
    { source = "/guides/<*>", target = "/guides/<*>/index.html", status = "200" },
    { source = "/blog/<*>", target = "/blog/<*>/index.html", status = "200" }
  ]

  ssm_parameters = {
    "${var.ssm_prefix}/ses/from-email" = {
      type        = "String"
      value       = "replace-me@example.com"
      description = "SES verified sender email"
    }
    "${var.ssm_prefix}/ses/admin-email" = {
      type        = "String"
      value       = "replace-me@example.com"
      description = "Admin inbox email"
    }
    "${var.ssm_prefix}/stripe/secret-key" = {
      type        = "SecureString"
      value       = "replace-me"
      description = "Stripe secret API key"
    }
    "${var.ssm_prefix}/stripe/webhook-secret" = {
      type        = "SecureString"
      value       = "replace-me"
      description = "Stripe webhook signing secret"
    }
    "${var.ssm_prefix}/stripe/publishable-key" = {
      type        = "String"
      value       = "pk_test_replace_me"
      description = "Stripe publishable key"
    }
    "${var.ssm_prefix}/stripe/price-lookup-key" = {
      type        = "String"
      value       = "ytboosterai_default"
      description = "Stripe price lookup key for one-time product"
    }
    "${var.ssm_prefix}/stripe/openai-api-key" = {
      type        = "SecureString"
      value       = "replace-me"
      description = "OpenAI API key placeholder using requested sample path"
    }
    "${var.ssm_prefix}/admin/password" = {
      type        = "SecureString"
      value       = "change-me"
      description = "Admin login password placeholder"
    }
    # YouTube Data API key: store ONLY inside admin/google/credentials-json as youtube_api_key (or under installed.*).
    # Do NOT manage /youtubebooster/youtube/api-key or /youtubebooster/admin/youtube-api-key here — keep them manual in SSM.
    "${var.ssm_prefix}/admin/google/credentials-json" = {
      type = "SecureString"
      value = var.admin_google_credentials_json != "" ? var.admin_google_credentials_json : jsonencode({
        installed = {
          client_id                   = var.admin_google_client_id != "" ? var.admin_google_client_id : "replace-me"
          project_id                  = var.admin_google_project_id != "" ? var.admin_google_project_id : "replace-me"
          auth_uri                    = "https://accounts.google.com/o/oauth2/auth"
          token_uri                   = "https://oauth2.googleapis.com/token"
          auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
          client_secret               = var.admin_google_client_secret != "" ? var.admin_google_client_secret : "replace-me"
          redirect_uris               = [var.admin_google_redirect_uri != "" ? var.admin_google_redirect_uri : "https://youtubeboosterai.com/oauth2/callback"]
        }
      })
      description = "Admin Google OAuth credentials (full JSON or built from granular params)"
    }
    "${var.ssm_prefix}/admin/google/client-id" = {
      type        = "SecureString"
      value       = var.admin_google_client_id != "" ? var.admin_google_client_id : "replace-me"
      description = "Admin Google OAuth client id (from credentials.json installed.client_id)"
    }
    "${var.ssm_prefix}/admin/google/client-secret" = {
      type        = "SecureString"
      value       = var.admin_google_client_secret != "" ? var.admin_google_client_secret : "replace-me"
      description = "Admin Google OAuth client secret (from credentials.json)"
    }
    "${var.ssm_prefix}/admin/google/project-id" = {
      type        = "String"
      value       = var.admin_google_project_id != "" ? var.admin_google_project_id : "replace-me"
      description = "Admin Google OAuth project id (from credentials.json)"
    }
    "${var.ssm_prefix}/admin/google/auth-uri" = {
      type        = "String"
      value       = "https://accounts.google.com/o/oauth2/auth"
      description = "Admin Google OAuth auth URI"
    }
    "${var.ssm_prefix}/admin/google/token-uri" = {
      type        = "String"
      value       = "https://oauth2.googleapis.com/token"
      description = "Admin Google OAuth token URI"
    }
    "${var.ssm_prefix}/admin/google/redirect-uri" = {
      type        = "String"
      value       = var.admin_google_redirect_uri != "" ? var.admin_google_redirect_uri : "https://youtubeboosterai.com/oauth2/callback"
      description = "Admin Google OAuth redirect URI (first redirect_uris entry)"
    }
    "${var.ssm_prefix}/features/enable-public-demo" = {
      type        = "String"
      value       = "true"
      description = "Public demo feature flag"
    }
    "${var.ssm_prefix}/features/demo-rate-limit-per-hour" = {
      type        = "String"
      value       = "10"
      description = "Public demo rate limit"
    }
    "${var.ssm_prefix}/cognito/region" = {
      type        = "String"
      value       = var.aws_region
      description = "Cognito user pool region for auth"
    }
    "${var.ssm_prefix}/cognito/user-pool-id" = {
      type        = "String"
      value       = aws_cognito_user_pool.users.id
      description = "Cognito user pool id for auth"
    }
    "${var.ssm_prefix}/cognito/app-client-id" = {
      type        = "String"
      value       = aws_cognito_user_pool_client.users_spa.id
      description = "Cognito app client id for auth"
    }
  }

  # Split so SecureString values can be frozen after first create (Console edits preserved).
  ssm_parameters_string = {
    for k, v in local.ssm_parameters : k => v if v.type == "String"
  }
  ssm_parameters_secure = {
    for k, v in local.ssm_parameters : k => v if v.type == "SecureString"
  }
}

resource "aws_ssm_parameter" "defaults_string" {
  for_each = var.create_placeholder_parameters ? local.ssm_parameters_string : {}

  name        = each.key
  description = each.value.description
  type        = each.value.type
  value       = each.value.value
  overwrite   = true

  tags = local.common_tags

  # After first create, preserve Console / CLI edits (same pattern as SecureString + pricing params).
  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "defaults_secure" {
  for_each = var.create_placeholder_parameters ? local.ssm_parameters_secure : {}

  name        = each.key
  description = each.value.description
  type        = each.value.type
  value       = each.value.value
  overwrite   = true

  tags = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

# Pricing: edit values in SSM/Console; Terraform will not overwrite after first create (same pattern as SecureStrings).
resource "aws_ssm_parameter" "pricing_one_time_price" {
  count = var.create_placeholder_parameters ? 1 : 0

  name        = "${var.ssm_prefix}/pricing/one-time-price"
  description = "One-time purchase price (SSM is source of truth; apply ignores value)"
  type        = "String"
  value       = var.one_time_price
  overwrite   = true

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "pricing_currency" {
  count = var.create_placeholder_parameters ? 1 : 0

  name        = "${var.ssm_prefix}/pricing/currency"
  description = "Pricing currency (SSM is source of truth; apply ignores value)"
  type        = "String"
  value       = var.currency
  overwrite   = true

  lifecycle {
    ignore_changes = [value]
  }
}

# Admin CRM login email: dedicated resource (also split from legacy defaults_string for clearer ops / state migration).
resource "aws_ssm_parameter" "admin_email" {
  count = var.create_placeholder_parameters ? 1 : 0

  name        = "${var.ssm_prefix}/admin/email"
  description = "Admin CRM login email (SSM is source of truth; apply ignores value after create)"
  type        = "String"
  value       = var.admin_login_email
  overwrite   = true
  tags        = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

# --- State migration: old single resource -> split string/secure (prefix must match var.ssm_prefix default) ---
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/ses/from-email"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/ses/from-email"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/ses/admin-email"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/ses/admin-email"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/stripe/publishable-key"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/stripe/publishable-key"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/stripe/price-lookup-key"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/stripe/price-lookup-key"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/email"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/admin/email"]
}

# Admin email: migrate from shared defaults_string to dedicated resource (ignore_changes on value).
moved {
  from = aws_ssm_parameter.defaults_string["/youtubebooster/admin/email"]
  to   = aws_ssm_parameter.admin_email[0]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/project-id"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/admin/google/project-id"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/auth-uri"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/admin/google/auth-uri"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/token-uri"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/admin/google/token-uri"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/redirect-uri"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/admin/google/redirect-uri"]
}
moved {
  from = aws_ssm_parameter.defaults_string["/youtubebooster/pricing/one-time-price"]
  to   = aws_ssm_parameter.pricing_one_time_price[0]
}
moved {
  from = aws_ssm_parameter.defaults_string["/youtubebooster/pricing/currency"]
  to   = aws_ssm_parameter.pricing_currency[0]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/features/enable-public-demo"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/features/enable-public-demo"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/features/demo-rate-limit-per-hour"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/features/demo-rate-limit-per-hour"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/cognito/region"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/cognito/region"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/cognito/user-pool-id"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/cognito/user-pool-id"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/cognito/app-client-id"]
  to   = aws_ssm_parameter.defaults_string["/youtubebooster/cognito/app-client-id"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/stripe/secret-key"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/stripe/secret-key"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/stripe/webhook-secret"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/stripe/webhook-secret"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/stripe/openai-api-key"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/stripe/openai-api-key"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/password"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/admin/password"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/credentials-json"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/admin/google/credentials-json"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/client-id"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/admin/google/client-id"]
}
moved {
  from = aws_ssm_parameter.defaults["/youtubebooster/admin/google/client-secret"]
  to   = aws_ssm_parameter.defaults_secure["/youtubebooster/admin/google/client-secret"]
}

# Legacy `/youtubebooster/youtube/api-key` may still exist in AWS + old state. Terraform no longer manages it.
# Before first apply after this change, run (one-time) if state lists it:
#   terraform state rm 'aws_ssm_parameter.defaults["/youtubebooster/youtube/api-key"]'
# so Terraform does not try to destroy the parameter. The app reads the Data API key from
# admin/google/credentials-json only (see SecretProviders.cs).

resource "aws_dynamodb_table" "users" {
  name         = "ybai-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "purchases" {
  name         = "ybai-purchases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "demo_analyses" {
  name         = "ybai-demo-analyses"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "reports" {
  name         = "ybai-reports"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "support" {
  name         = "ybai-support"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "activity" {
  name         = "ybai-activity"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_cognito_user_pool" "users" {
  name = "youtubebooster-users"

  username_attributes = ["email"]

  auto_verified_attributes = ["email"]

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }
}

resource "aws_cognito_user_pool_client" "users_spa" {
  name         = "youtubebooster-users-spa"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  enable_token_revocation = true
}

resource "aws_iam_role" "lambda_exec" {
  count = var.deploy_backend_lambda ? 1 : 0

  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "lambda_policy" {
  count = var.deploy_backend_lambda ? 1 : 0

  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_exec[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.purchases.arn,
          aws_dynamodb_table.demo_analyses.arn,
          aws_dynamodb_table.reports.arn,
          aws_dynamodb_table.support.arn,
          aws_dynamodb_table.activity.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_prefix}*"
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/*",
          "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:application-inference-profile/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "backend" {
  count = var.deploy_backend_lambda ? 1 : 0

  filename         = var.backend_package_path
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.lambda_exec[0].arn
  handler          = var.backend_handler
  runtime          = "dotnet8"
  source_code_hash = filebase64sha256(var.backend_package_path)
  timeout          = 30
  memory_size      = 1024

  environment {
    variables = {
      LambdaEventSource              = "HttpApi"
      APP_ENVIRONMENT                = "prod"
      SSM__BASEPATH                  = var.ssm_prefix
      Storage__Provider              = "DynamoDb"
      Storage__DemoTable             = aws_dynamodb_table.demo_analyses.name
      Storage__SupportTable          = aws_dynamodb_table.support.name
      Storage__PurchasesTable        = aws_dynamodb_table.purchases.name
      Storage__ActivityTable         = aws_dynamodb_table.activity.name
      Stripe__PriceLookupKey         = "ytboosterai_default"
      Features__EnablePublicDemo     = "true"
      Features__DemoRateLimitPerHour = "10"
      PUBLIC_SITE_URL                = var.public_site_url
      # AI Growth Studio: Bedrock client uses BEDROCK_REGION then AWS_REGION (set by Lambda). Optional: BEDROCK_MODEL_ID overrides SSM bedrock/model.
      BEDROCK_REGION = var.aws_region
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "backend" {
  count = var.deploy_backend_lambda ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.backend[0].function_name}"
  retention_in_days = 14

  tags = local.common_tags
}

resource "aws_apigatewayv2_api" "http_api" {
  count = var.deploy_backend_lambda ? 1 : 0

  name          = "${var.project_name}-http"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers     = ["content-type", "authorization", "stripe-signature", "x-yb-anonymous-id"]
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_origins     = length(var.cors_allowed_origins) > 0 ? var.cors_allowed_origins : ["*"]
    allow_credentials = true
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_integration" "backend" {
  count = var.deploy_backend_lambda ? 1 : 0

  api_id                 = aws_apigatewayv2_api.http_api[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend[0].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  count = var.deploy_backend_lambda ? 1 : 0

  api_id    = aws_apigatewayv2_api.http_api[0].id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.backend[0].id}"
}

resource "aws_apigatewayv2_route" "root" {
  count = var.deploy_backend_lambda ? 1 : 0

  api_id    = aws_apigatewayv2_api.http_api[0].id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.backend[0].id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  count = var.deploy_backend_lambda ? 1 : 0

  api_id      = aws_apigatewayv2_api.http_api[0].id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit   = 100
    throttling_rate_limit    = 50
  }

  tags = local.common_tags
}

resource "aws_lambda_permission" "api_gateway" {
  count = var.deploy_backend_lambda ? 1 : 0

  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api[0].execution_arn}/*/*"
}

resource "aws_amplify_app" "frontend" {
  count = var.enable_amplify_app ? 1 : 0

  name                        = "${var.project_name}-web"
  repository                  = var.amplify_repository_url
  access_token                = var.amplify_access_token
  build_spec                  = file("${path.module}/../../amplify.yml")
  enable_auto_branch_creation = false

  # Path redirects + SPA rewrite (same order intent as root amplify.yml). Host→www uses frontend/public/_redirects.
  custom_rule {
    source = "/home"
    status = "301"
    target = "/"
  }
  custom_rule {
    source = "/index"
    status = "301"
    target = "/"
  }
  custom_rule {
    source = "/index.html"
    status = "301"
    target = "/"
  }
  dynamic "custom_rule" {
    for_each = local.amplify_seo_route_rules

    content {
      source = custom_rule.value.source
      status = custom_rule.value.status
      target = custom_rule.value.target
    }
  }
  custom_rule {
    source = "/<*>"
    status = "200"
    target = "/index.html"
  }

  environment_variables = {
    AMPLIFY_MONOREPO_APP_ROOT = "frontend"
    VITE_API_BASE_URL         = var.deploy_backend_lambda ? aws_apigatewayv2_api.http_api[0].api_endpoint : "https://api.example.com"
  }

  tags = local.common_tags
}

resource "aws_amplify_branch" "main" {
  count = var.enable_amplify_app ? 1 : 0

  app_id      = aws_amplify_app.frontend[0].id
  branch_name = var.amplify_branch_name
  framework   = "React"
  stage       = "PRODUCTION"

  enable_auto_build = true

  tags = local.common_tags
}
