variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "sumosave-wms"
}

variable "db_instance_class" {
  description = "Aurora PostgreSQL instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "vpc_id" {
  description = "VPC ID for all resources"
  type        = string
  default     = "vpc-placeholder"
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
  default     = ["subnet-placeholder-1", "subnet-placeholder-2", "subnet-placeholder-3"]
}

variable "db_name" {
  description = "Aurora database name"
  type        = string
  default     = "sumosave_wms"
}

variable "db_username" {
  description = "Aurora master username"
  type        = string
  default     = "wmsadmin"
}
