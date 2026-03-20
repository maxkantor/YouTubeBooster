output "api_base_url" {
  description = "API base URL for the Lambda-backed HTTP API."
  value       = var.deploy_backend_lambda ? aws_apigatewayv2_api.http_api[0].api_endpoint : null
}

output "lambda_function_name" {
  description = "Backend Lambda function name."
  value       = var.deploy_backend_lambda ? aws_lambda_function.backend[0].function_name : null
}

output "amplify_default_domain" {
  description = "Amplify default domain for the frontend app."
  value       = var.enable_amplify_app ? aws_amplify_app.frontend[0].default_domain : null
}

output "ssm_parameter_names" {
  description = "SSM parameters managed by Terraform (YouTube Data API key lives in admin/google/credentials-json only)."
  value       = sort(concat(keys(local.ssm_parameters_string), keys(local.ssm_parameters_secure)))
}
