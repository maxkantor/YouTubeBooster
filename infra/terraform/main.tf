terraform {
  required_version = ">= 1.6.0"

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
    "${var.ssm_prefix}/admin/email" = {
      type        = "String"
      value       = "admin@example.com"
      description = "Admin login email"
    }
    "${var.ssm_prefix}/admin/password" = {
      type        = "SecureString"
      value       = "change-me"
      description = "Admin login password placeholder"
    }
    "${var.ssm_prefix}/youtube/api-key" = {
      type        = "SecureString"
      value       = var.youtube_api_key != "" ? var.youtube_api_key : "replace-me"
      description = "YouTube Data API key for public demo analysis"
    }
    "${var.ssm_prefix}/admin/google/credentials-json" = {
      type        = "SecureString"
      value       = var.admin_google_credentials_json != "" ? var.admin_google_credentials_json : jsonencode({
        installed = {
          client_id                   = var.admin_google_client_id != "" ? var.admin_google_client_id : "replace-me"
          project_id                  = var.admin_google_project_id != "" ? var.admin_google_project_id : "replace-me"
          auth_uri                    = "https://accounts.google.com/o/oauth2/auth"
          token_uri                   = "https://oauth2.googleapis.com/token"
          auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
          client_secret               = var.admin_google_client_secret != "" ? var.admin_google_client_secret : "replace-me"
          redirect_uris               = [var.admin_google_redirect_uri != "" ? var.admin_google_redirect_uri : "http://localhost"]
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
      value       = var.admin_google_redirect_uri != "" ? var.admin_google_redirect_uri : "http://localhost"
      description = "Admin Google OAuth redirect URI (first redirect_uris entry)"
    }
    "${var.ssm_prefix}/pricing/one-time-price" = {
      type        = "String"
      value       = var.one_time_price
      description = "Default one-time purchase price"
    }
    "${var.ssm_prefix}/pricing/currency" = {
      type        = "String"
      value       = var.currency
      description = "Default pricing currency"
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
  }
}

resource "aws_ssm_parameter" "defaults" {
  for_each = var.create_placeholder_parameters ? local.ssm_parameters : {}

  name        = each.key
  description = each.value.description
  type        = each.value.type
  value       = each.value.value
  overwrite   = true

  tags = local.common_tags
}

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
      APP_ENVIRONMENT                = "prod"
      SSM__BASEPATH                  = var.ssm_prefix
      Storage__Provider              = "DynamoDb"
      Storage__DemoTable             = aws_dynamodb_table.demo_analyses.name
      Storage__SupportTable          = aws_dynamodb_table.support.name
      Storage__PurchasesTable        = aws_dynamodb_table.purchases.name
      Storage__ActivityTable         = aws_dynamodb_table.activity.name
      Pricing__OneTimePrice          = var.one_time_price
      Pricing__Currency              = var.currency
      Stripe__PriceLookupKey         = "ytboosterai_default"
      Features__EnablePublicDemo     = "true"
      Features__DemoRateLimitPerHour = "10"
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
    allow_headers = ["content-type", "authorization", "stripe-signature"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["*"]
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

  name                = "${var.project_name}-web"
  repository          = var.amplify_repository_url
  access_token        = var.amplify_access_token
  build_spec          = file("${path.module}/../amplify.yml")
  enable_auto_branch_creation = false

  environment_variables = {
    VITE_API_BASE_URL            = var.deploy_backend_lambda ? aws_apigatewayv2_api.http_api[0].api_endpoint : "https://api.example.com"
    VITE_STRIPE_PUBLISHABLE_KEY  = "pk_test_replace_me"
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
