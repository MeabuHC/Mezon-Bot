
This guide provides comprehensive instructions on how to use buttons in the Mezon SDK, including how to create buttons, send them in channels, combine them with markdown, and handle button clicks.

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Button Types and Styles](#button-types-and-styles)
4. [Creating Buttons](#creating-buttons)
5. [Sending Messages with Buttons in Channels](#sending-messages-with-buttons-in-channels)
6. [Using Markdown with Buttons](#using-markdown-with-buttons)
7. [Handling Button Clicks](#handling-button-clicks)
8. [Complete Examples](#complete-examples)
9. [Best Practices](#best-practices)

---

## Introduction

Mezon SDK provides interactive buttons that allow users to interact with your bot through clickable UI elements. Buttons can be used in channel messages, direct messages, and can be combined with markdown formatting for rich text messages.

---

## Prerequisites

Before using buttons, ensure you have:

1. **Mezon SDK installed**:
   ```bash
   yarn add mezon-sdk
   ```

2. **Required imports**:
   ```typescript
   import {
     EButtonMessageStyle,
     EMessageComponentType,
     EMarkdownType,
     ChannelMessage,
     Events,
     MezonClient,
   } from 'mezon-sdk';
   ```

3. **Event emitter setup** (for handling button clicks):
   ```typescript
   import { OnEvent } from '@nestjs/event-emitter';
   ```

---

## Button Types and Styles

### Button Styles

Mezon SDK provides several button styles:

- **`EButtonMessageStyle.PRIMARY`** - Primary action button (blue)
- **`EButtonMessageStyle.SUCCESS`** - Success/confirm action (green)
- **`EButtonMessageStyle.SECONDARY`** - Secondary action (gray)
- **`EButtonMessageStyle.DANGER`** - Dangerous action (red)

### Component Types

- **`EMessageComponentType.BUTTON`** - Standard clickable button
- **`EMessageComponentType.INPUT`** - Input field (used in forms)
- **`EMessageComponentType.RADIO`** - Radio button group
- **`EMessageComponentType.SELECT`** - Dropdown select
- **`EMessageComponentType.ANIMATION`** - Animation component

---

## Creating Buttons

### Basic Button Structure

A button consists of:
1. **`id`** - Unique identifier (used to identify which button was clicked)
2. **`type`** - Component type (`EMessageComponentType.BUTTON`)
3. **`component`** - Button configuration with `label` and `style`

### Example: Creating a Single Button

```typescript
const button = {
  id: `myButton_ACTION_${userId}_${clanId}`,
  type: EMessageComponentType.BUTTON,
  component: {
    label: 'Click Me',
    style: EButtonMessageStyle.PRIMARY,
  },
};
```

### Example: Creating Multiple Buttons (Button Row)

Buttons are grouped in rows. Each row is an object with a `components` array:

```typescript
const components = [
  {
    components: [
      {
        id: `action_CANCEL_${userId}_${clanId}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: 'Cancel',
          style: EButtonMessageStyle.SECONDARY,
        },
      },
      {
        id: `action_CONFIRM_${userId}_${clanId}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: 'Confirm',
          style: EButtonMessageStyle.SUCCESS,
        },
      },
    ],
  },
];
```

### Button ID Naming Convention

It's recommended to encode information in the button ID for easy parsing:

```typescript
// Format: {actionType}_{ACTION}_{userId}_{clanId}_{mode}_{isPublic}_{color}_{username}_{...additionalData}
const buttonId = `poll_CANCEL_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${color}_${username}`;
```

This allows you to extract all necessary information when handling button clicks.

---

## Sending Messages with Buttons in Channels

### Method 1: Using `reply()` with Buttons

```typescript
async execute(args: string[], message: ChannelMessage) {
  const messageChannel = await this.getChannelMessage(message);
  
  const components = [
    {
      components: [
        {
          id: `myAction_BUTTON1_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Button 1',
            style: EButtonMessageStyle.PRIMARY,
          },
        },
        {
          id: `myAction_BUTTON2_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Button 2',
            style: EButtonMessageStyle.SUCCESS,
          },
        },
      ],
    },
  ];

  return await messageChannel?.reply({
    components,
  });
}
```

### Method 2: Using `send()` with Buttons

```typescript
const channel = await this.client.channels.fetch(channelId);
await channel.send({
  components: [
    {
      components: [
        {
          id: `action_BUTTON_${userId}_${clanId}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Send Button',
            style: EButtonMessageStyle.PRIMARY,
          },
        },
      ],
    },
  ],
});
```

### Method 3: Using `sendDM()` for Direct Messages

```typescript
const user = await this.client.users.fetch(userId);
await user.sendDM({
  components: [
    {
      components: [
        {
          id: `dmAction_BUTTON_${userId}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'DM Button',
            style: EButtonMessageStyle.SUCCESS,
          },
        },
      ],
    },
  ],
});
```

---

## Using Markdown with Buttons

You can combine markdown formatting with buttons in the same message. The `mk` (markdown) array defines text formatting, while `components` defines buttons.

### Markdown Types

- **`EMarkdownType.PRE`** - Preformatted text (code block style)

### Example: Message with Markdown and Buttons

```typescript
async execute(args: string[], message: ChannelMessage) {
  const messageChannel = await this.getChannelMessage(message);
  
  const messageText = 'This is a message with **markdown** and buttons!';
  
  const components = [
    {
      components: [
        {
          id: `action_CONFIRM_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Confirm',
            style: EButtonMessageStyle.SUCCESS,
          },
        },
        {
          id: `action_CANCEL_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Cancel',
            style: EButtonMessageStyle.SECONDARY,
          },
        },
      ],
    },
  ];

  return await messageChannel?.reply({
    t: messageText,  // Text content
    mk: [
      {
        type: EMarkdownType.PRE,
        s: 0,  // Start position
        e: messageText.length,  // End position
      },
    ],
    components,  // Buttons
  });
}
```

### Example: Help Command with Markdown and Buttons

```typescript
async execute(args: string[], message: ChannelMessage) {
  const messageChannel = await this.getChannelMessage(message);
  
  const messageContent = 
    'Utility - Help Menu' +
    '\n' +
    '• Utility Commands' +
    '\n' +
    'Available commands: help, poll, role';
  
  const components = [
    {
      components: [
        {
          id: `help_MORE_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'More Info',
            style: EButtonMessageStyle.PRIMARY,
          },
        },
      ],
    },
  ];

  return await messageChannel?.reply({
    t: messageContent,
    mk: [
      {
        type: EMarkdownType.PRE,
        s: 0,
        e: messageContent.length,
      },
    ],
    components,
  });
}
```

---

## Handling Button Clicks

### Step 1: Listen for Button Click Events

Create a listener that handles `Events.MessageButtonClicked`:

```typescript
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from 'mezon-sdk';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ButtonClickHandler {
  @OnEvent(Events.MessageButtonClicked)
  async handleButtonClick(data: MessageButtonClicked) {
    try {
      // Parse button ID to extract action type
      const args = data.button_id.split('_');
      const actionType = args[0];  // e.g., 'poll', 'lixi', 'role'
      const action = args[1];      // e.g., 'CANCEL', 'CONFIRM', 'VOTE'
      
      // Handle different action types
      switch (actionType) {
        case 'poll':
          await this.handlePollAction(data, action);
          break;
        case 'lixi':
          await this.handleLixiAction(data, action);
          break;
        case 'role':
          await this.handleRoleAction(data, action);
          break;
        default:
          console.log('Unknown button action:', actionType);
      }
    } catch (error) {
      console.error('Error handling button click:', error);
    }
  }
  
  private async handlePollAction(data: MessageButtonClicked, action: string) {
    const [
      _,
      actionType,
      userId,
      clanId,
      mode,
      isPublic,
      color,
      username,
    ] = data.button_id.split('_');
    
    const channel = await this.client.channels.fetch(data.channel_id);
    const message = await channel.messages.fetch(data.message_id);
    const user = await this.client.users.fetch(data.user_id);
    
    switch (action) {
      case 'CANCEL':
        // Handle cancel action
        await message.update({
          t: 'Poll cancelled!',
          mk: [{ type: EMarkdownType.PRE, s: 0, e: 15 }],
        });
        break;
        
      case 'VOTE':
        // Handle vote action
        const extraData = JSON.parse(data.extra_data || '{}');
        // Process vote data
        break;
        
      case 'FINISH':
        // Handle finish action
        break;
    }
  }
}
```

### Step 2: Access Button Click Data

The `MessageButtonClicked` event provides:

- **`button_id`** - The ID of the clicked button
- **`user_id`** - ID of the user who clicked
- **`message_id`** - ID of the message containing the button
- **`channel_id`** - ID of the channel
- **`clan_id`** - ID of the clan
- **`extra_data`** - Additional data (JSON string) from form inputs, radio selections, etc.

### Step 3: Update Messages After Button Click

```typescript
async handleButtonClick(data: MessageButtonClicked) {
  const channel = await this.client.channels.fetch(data.channel_id);
  const message = await channel.messages.fetch(data.message_id);
  
  // Update the message
  await message.update({
    t: 'Button was clicked!',
    mk: [{ type: EMarkdownType.PRE, s: 0, e: 20 }],
    components: [
      {
        components: [
          {
            id: `action_DONE_${data.user_id}_${data.clan_id}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: 'Done',
              style: EButtonMessageStyle.SUCCESS,
            },
          },
        ],
      },
    ],
  });
}
```

---

## Complete Examples

### Example 1: Simple Confirmation Dialog

```typescript
import {
  ChannelMessage,
  EButtonMessageStyle,
  EMarkdownType,
  EMessageComponentType,
} from 'mezon-sdk';

async execute(args: string[], message: ChannelMessage) {
  const messageChannel = await this.getChannelMessage(message);
  
  const confirmText = 'Are you sure you want to proceed?';
  
  const components = [
    {
      components: [
        {
          id: `confirm_YES_${message.sender_id}_${message.clan_id}_${message.channel_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Yes',
            style: EButtonMessageStyle.SUCCESS,
          },
        },
        {
          id: `confirm_NO_${message.sender_id}_${message.clan_id}_${message.channel_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'No',
            style: EButtonMessageStyle.SECONDARY,
          },
        },
      ],
    },
  ];

  return await messageChannel?.reply({
    t: confirmText,
    mk: [
      {
        type: EMarkdownType.PRE,
        s: 0,
        e: confirmText.length,
      },
    ],
    components,
  });
}
```

### Example 2: Poll with Buttons

```typescript
async createPoll(message: ChannelMessage, title: string, options: string[]) {
  const messageChannel = await this.getChannelMessage(message);
  
  const embed = [
    {
      color: '#FF5733',
      title: `[Poll] - ${title}`,
      description: 'Select an option to vote.',
      fields: [
        {
          name: '',
          value: '',
          inputs: {
            id: 'POLL',
            type: EMessageComponentType.RADIO,
            component: options.map((option, index) => ({
              label: `${index + 1}. ${option}`,
              value: `poll_${index}`,
              style: EButtonMessageStyle.SUCCESS,
            })),
          },
        },
      ],
      timestamp: new Date().toISOString(),
      footer: 'Mezon Bot',
    },
  ];

  const components = [
    {
      components: [
        {
          id: `poll_CANCEL_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Cancel',
            style: EButtonMessageStyle.SECONDARY,
          },
        },
        {
          id: `poll_VOTE_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Vote',
            style: EButtonMessageStyle.SUCCESS,
          },
        },
        {
          id: `poll_FINISH_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Finish',
            style: EButtonMessageStyle.DANGER,
          },
        },
      ],
    },
  ];

  return await messageChannel?.reply({
    embed,
    components,
  });
}
```

### Example 3: Form with Input Fields and Buttons

```typescript
async createForm(message: ChannelMessage) {
  const messageChannel = await this.getChannelMessage(message);
  
  const embed = [
    {
      color: '#3498DB',
      title: 'User Registration Form',
      fields: [
        {
          name: 'Username',
          value: '',
          inputs: {
            id: 'username',
            type: EMessageComponentType.INPUT,
            component: {
              id: 'username',
              placeholder: 'Enter your username',
              required: true,
            },
          },
        },
        {
          name: 'Email',
          value: '',
          inputs: {
            id: 'email',
            type: EMessageComponentType.INPUT,
            component: {
              id: 'email',
              placeholder: 'Enter your email',
              required: true,
              type: 'email',
            },
          },
        },
      ],
      timestamp: new Date().toISOString(),
      footer: 'Mezon Bot',
    },
  ];

  const components = [
    {
      components: [
        {
          id: `form_CANCEL_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Cancel',
            style: EButtonMessageStyle.SECONDARY,
          },
        },
        {
          id: `form_SUBMIT_${message.sender_id}_${message.clan_id}`,
          type: EMessageComponentType.BUTTON,
          component: {
            label: 'Submit',
            style: EButtonMessageStyle.SUCCESS,
          },
        },
      ],
    },
  ];

  return await messageChannel?.reply({
    embed,
    components,
  });
}
```

### Example 4: Handling Form Submission

```typescript
@OnEvent(Events.MessageButtonClicked)
async handleFormSubmission(data: MessageButtonClicked) {
  const [actionType, action] = data.button_id.split('_');
  
  if (actionType === 'form' && action === 'SUBMIT') {
    // Parse form data from extra_data
    const formData = JSON.parse(data.extra_data || '{}');
    const username = formData.username;
    const email = formData.email;
    
    // Process form data
    console.log('Form submitted:', { username, email });
    
    // Update message
    const channel = await this.client.channels.fetch(data.channel_id);
    const message = await channel.messages.fetch(data.message_id);
    
    await message.update({
      t: `Form submitted successfully!\nUsername: ${username}\nEmail: ${email}`,
      mk: [
        {
          type: EMarkdownType.PRE,
          s: 0,
          e: 50,
        },
      ],
    });
  }
}
```

---

## Best Practices

### 1. Button ID Structure

Use a consistent naming convention for button IDs:

```typescript
// Format: {feature}_{ACTION}_{userId}_{clanId}_{...additionalData}
const buttonId = `poll_VOTE_${userId}_${clanId}_${mode}_${isPublic}`;
```

### 2. Error Handling

Always wrap button click handlers in try-catch blocks:

```typescript
@OnEvent(Events.MessageButtonClicked)
async handleButtonClick(data: MessageButtonClicked) {
  try {
    // Handle button click
  } catch (error) {
    console.error('Error handling button click:', error);
    // Optionally send error message to user
  }
}
```

### 3. Permission Checks

Verify user permissions before processing button clicks:

```typescript
async handleButtonClick(data: MessageButtonClicked) {
  const [_, action, authorId] = data.button_id.split('_');
  
  // Check if user has permission
  if (data.user_id !== authorId && action === 'CANCEL') {
    const user = await this.client.users.fetch(data.user_id);
    await user.sendDM({
      t: '❌ You do not have permission to perform this action!',
      mk: [{ type: EMarkdownType.PRE, s: 0, e: 50 }],
    });
    return;
  }
  
  // Process action
}
```

### 4. Message Updates

Update messages after button clicks to provide feedback:

```typescript
async handleButtonClick(data: MessageButtonClicked) {
  const channel = await this.client.channels.fetch(data.channel_id);
  const message = await channel.messages.fetch(data.message_id);
  
  // Update message with feedback
  await message.update({
    t: 'Action completed successfully!',
    mk: [{ type: EMarkdownType.PRE, s: 0, e: 30 }],
  });
}
```

### 5. Button Styling

Use appropriate button styles for different actions:

- **PRIMARY** - Main/default action
- **SUCCESS** - Confirm/positive action
- **SECONDARY** - Cancel/neutral action
- **DANGER** - Delete/destructive action

### 6. Combining Markdown and Buttons

When using markdown with buttons:

```typescript
const messageText = 'Important message with **formatting**';
await messageChannel?.reply({
  t: messageText,
  mk: [
    {
      type: EMarkdownType.PRE,
      s: 0,  // Start at beginning
      e: messageText.length,  // End at end of text
    },
  ],
  components: [/* buttons */],
});
```

### 7. Button Row Limits

Keep button rows organized and limit the number of buttons per row (typically 3-5 buttons max):

```typescript
// Good: 3 buttons per row
const components = [
  {
    components: [
      { /* button 1 */ },
      { /* button 2 */ },
      { /* button 3 */ },
    ],
  },
];

// If you need more buttons, create multiple rows
const components = [
  {
    components: [
      { /* button 1 */ },
      { /* button 2 */ },
    ],
  },
  {
    components: [
      { /* button 3 */ },
      { /* button 4 */ },
    ],
  },
];
```

### 8. Storing Button State

For complex interactions, store button state in a database:

```typescript
// Store message state
await this.messageRepository.insert({
  messageId: sentMessage.message_id,
  userId: message.sender_id,
  clanId: message.clan_id,
  channelId: message.channel_id,
  state: 'pending',
  data: {},
});

// Retrieve state when button is clicked
const messageState = await this.messageRepository.findOne({
  where: { messageId: data.message_id },
});
```

---

## Summary

This guide covers:

✅ Creating buttons with different styles  
✅ Sending messages with buttons in channels  
✅ Combining markdown with buttons  
✅ Handling button click events  
✅ Complete working examples  
✅ Best practices for button implementation  

For more information, refer to the Mezon SDK documentation and explore the examples in the codebase.

---

## Additional Resources

- Check `src/bot/lixi/lixi.command.ts` for button examples with forms
- Check `src/bot/commands/poll/poll.service.ts` for complex button interactions
- Check `src/bot/listeners/onMessageButtonClicked.listener.ts` for button click handling patterns

