variable "aws_region" {
  description = "AWS region for YouTube Booster AI."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name prefix."
  type        = string
  default     = "youtubebooster-ai"
}

variable "ssm_prefix" {
  description = "Base SSM path prefix."
  type        = string
  default     = "/youtubebooster"
}

variable "create_placeholder_parameters" {
  description = "Whether to create placeholder SSM parameters."
  type        = bool
  default     = true
}

variable "deploy_backend_lambda" {
  description = "Whether to provision the Lambda/API Gateway resources."
  type        = bool
  default     = false
}

variable "backend_package_path" {
  description = "Path to a packaged Lambda deployment zip."
  type        = string
  default     = ""
}

variable "backend_handler" {
  description = "Lambda handler name."
  type        = string
  default     = "YouTubeBoosterAi.Api"
}

variable "enable_amplify_app" {
  description = "Whether to create the Amplify app and branch resources."
  type        = bool
  default     = false
}

variable "amplify_repository_url" {
  description = "Git repository URL for Amplify."
  type        = string
  default     = ""
}

variable "amplify_access_token" {
  description = "Git provider access token for Amplify."
  type        = string
  default     = ""
  sensitive   = true
}

variable "amplify_branch_name" {
  description = "Amplify branch to create."
  type        = string
  default     = "main"
}

variable "one_time_price" {
  description = "Default one-time purchase price."
  type        = string
  default     = "49.99"
}

variable "currency" {
  description = "Default pricing currency."
  type        = string
  default     = "USD"
}

# Admin Google OAuth (credentials.json) — set these to populate SSM with your values
variable "admin_google_client_id" {
  description = "Google OAuth client_id from credentials.json (installed or web)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_google_client_secret" {
  description = "Google OAuth client_secret from credentials.json."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_google_project_id" {
  description = "Google Cloud project_id from credentials.json."
  type        = string
  default     = ""
}

variable "admin_google_redirect_uri" {
  description = "OAuth redirect_uri (first entry from redirect_uris in credentials.json)."
  type        = string
  default     = "http://localhost"
}

variable "admin_google_credentials_json" {
  description = "Optional: full credentials.json string (overrides granular params if set)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "youtube_api_key" {
  description = "YouTube Data API v3 key for public channel demo (create in same GCP project)."
  type        = string
  default     = ""
  sensitive   = true
}
