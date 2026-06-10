-- Migration: add short_summary column to message_map for list display
-- short_summary 由 LLM 分析邮件时生成，用于邮件列表显示；NULL 表示尚未分析（回退到 subject）
ALTER TABLE message_map ADD COLUMN short_summary TEXT;
