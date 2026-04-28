variable "kms_key_arn" {
  type = string
}

variable "environment" {
  type = string
}

locals {
  queues = ["GRN-Events", "Alert-Events", "Audit-Events", "Sync-Events"]
}

resource "aws_sqs_queue" "dlq" {
  for_each                  = toset(local.queues)
  name                      = "sumosave-wms-${each.key}-DLQ-${var.environment}"
  message_retention_seconds = 1209600 # 14 days
  kms_master_key_id         = var.kms_key_arn

  tags = {
    Name        = "sumosave-wms-${each.key}-DLQ-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_sqs_queue" "main" {
  for_each                   = toset(local.queues)
  name                       = "sumosave-wms-${each.key}-${var.environment}"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400 # 1 day
  kms_master_key_id          = var.kms_key_arn

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = 5
  })

  tags = {
    Name        = "sumosave-wms-${each.key}-${var.environment}"
    Environment = var.environment
  }
}

output "queue_urls" {
  value = { for k, q in aws_sqs_queue.main : k => q.url }
}

output "queue_arns" {
  value = { for k, q in aws_sqs_queue.main : k => q.arn }
}
