# Google Chat Webhook Setup Guide

## 1. Create Google Chat Webhook

1. Open Google Chat
2. Create a space or select an existing space
3. Click on the space name → "Apps & integrations"
4. Click "Add webhooks"
5. Name your webhook (e.g., "RepostLens Analysis Bot")
6. Copy the webhook URL

## 2. Configure Environment Variable

Add the webhook URL to your `.env` file:

```bash
GOOGLE_CHAT_WEBHOOK_URL="https://chat.googleapis.com/v1/spaces/YOUR_SPACE_ID/messages?key=YOUR_KEY&token=YOUR_TOKEN"
```

## 3. Test the Integration

You can test the webhook using the built-in test endpoint:

```typescript
// In your browser console or a test file
const response = await fetch('/api/trpc/chat.testWebhook');
const result = await response.json();
console.log(result);
```

## 4. Usage

1. Click "ANALYZE" on any search result card
2. Once analysis is complete, a "📨 CHAT" button will appear
3. Click the chat button to send the formatted analysis to Google Chat

## Message Format

The bot will send messages in this format:

```
📊 SEO 分析報告
📍 頁面: [URL]
🎯 Best Query: [Keyword]
📝 策略: [REPOST/NEW POST/BOTH]

📈 短期優化 (1天內):
• [Action items]

🎯 語義劫持布局 (1週內):
• [Strategic items]

📝 執行清單:
1. [Task 1]
2. [Task 2]
...

⏰ [Timestamp]
```

## Troubleshooting

- If the webhook URL is not set, you'll see an error message
- Check the browser console for detailed error messages
- Ensure the webhook URL is correctly formatted and active
- The webhook must be from a Google Chat space where you have permission to post