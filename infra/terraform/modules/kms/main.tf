variable "environment" {
  type = string
}

resource "aws_kms_key" "rds" {
  description             = "KMS key for Aurora RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "sumosave-wms-rds-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/sumosave-wms-rds-${var.environment}"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_kms_key" "elasticache" {
  description             = "KMS key for ElastiCache encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "sumosave-wms-elasticache-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "elasticache" {
  name          = "alias/sumosave-wms-elasticache-${var.environment}"
  target_key_id = aws_kms_key.elasticache.key_id
}

resource "aws_kms_key" "sqs" {
  description             = "KMS key for SQS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "sumosave-wms-sqs-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "sqs" {
  name          = "alias/sumosave-wms-sqs-${var.environment}"
  target_key_id = aws_kms_key.sqs.key_id
}

resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "sumosave-wms-s3-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "s3" {
  name          = "alias/sumosave-wms-s3-${var.environment}"
  target_key_id = aws_kms_key.s3.key_id
}

output "rds_key_arn" {
  value = aws_kms_key.rds.arn
}

output "elasticache_key_arn" {
  value = aws_kms_key.elasticache.arn
}

output "sqs_key_arn" {
  value = aws_kms_key.sqs.arn
}

output "s3_key_arn" {
  value = aws_kms_key.s3.arn
}
