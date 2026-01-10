# Quiz Button Hiding Mechanism Documentation

## ⚠️ IMPORTANT: DM (Direct Message) Only
**This feature works exclusively in DM (Direct Messages), NOT in public channels.** All quiz questions are sent to users' private DM channels.

## Quick Summary

**How buttons are removed:**
1. Quiz question is sent to user's **DM channel** (not public channel) with buttons 1, 2, 3, 4
2. User clicks a button in their DM
3. System fetches the **DM channel** using `user.dmChannelId`
4. System updates the message with **only the embed** (no `components` field)
5. Buttons automatically disappear because `components` field is omitted

**Critical code line:**
```typescript
await message.update({ embed }); // No 'components' = buttons removed
```

**Location:** `src/bot/listeners/messagebuttonclick.handle.ts` line 330

## Overview
This document explains how the daily quiz/question feature hides or removes buttons after a user selects an answer. The system uses a message update mechanism that removes button components when updating the message content in a DM channel.

## Architecture Flow

### 1. Quiz Question Generation (DM Channel)
**File:** `src/bot/services/quiz.services.ts`  
**Method:** `generateQuestion(question, channelDmId)`

**Complete Implementation:**
```typescript
generateQuestion(question, channelDmId) {
  // channelDmId is the DM channel ID (NOT a public channel)
  const color = getRandomColor(); // e.g., '#57F287'
  const title = question.topic
    ? `[${question.topic.toUpperCase()}] ${question.title}`
    : question.title;
  
  const buttons = [];
  const mess = `${title}\n ${question.options
    .map((otp, index) => {
      // Create button for each answer option (1, 2, 3, 4, etc.)
      buttons.push({
        type: EMessageComponentType.BUTTON, // Button type constant
        id: `question_${index + 1}_${channelDmId}_${color}`,
        // Button ID format: question_{answer_number}_{dmChannelId}_{color}
        // Example: "question_1_1234567890_#57F287"
        component: {
          label: `${index + 1}`, // Button shows "1", "2", "3", "4"
          style: EButtonMessageStyle.PRIMARY, // Blue button style
        },
      });
      return `${index + 1} - ${otp}`;
    })
    .join('\n ')}`;

  // Components array contains all buttons
  const components = [
    {
      components: buttons, // Array of button objects
    },
  ];
  
  // Embed shows the question in a formatted box
  const embed = [
    {
      color: color,
      title: `${title}`,
      description:
        '```' +
        '\n' +
        `${question.options
          .map((otp, index) => {
            return `${index + 1} - ${otp}`;
          })
          .join('\n')}` +
        '```' +
        '\n(Chọn đáp án đúng tương ứng phía bên dưới!)',
    },
  ];
  
  return { mess, components, embed };
}
```

**Data Structure Example:**
```typescript
// question object structure:
{
  id: 123,
  title: "What is 2+2?",
  topic: "math",
  options: ["3", "4", "5", "6"], // Array of answer options
  correct: 2, // Index of correct answer (0-based, so "4" is index 2)
}

// channelDmId example: "1234567890123456789" (DM channel ID string)

// Return value structure:
{
  mess: "[MATH] What is 2+2?\n 1 - 3\n 2 - 4\n 3 - 5\n 4 - 6",
  components: [{
    components: [
      { type: 1, id: "question_1_1234567890123456789_#57F287", component: { label: "1", style: 1 } },
      { type: 1, id: "question_2_1234567890123456789_#57F287", component: { label: "2", style: 1 } },
      { type: 1, id: "question_3_1234567890123456789_#57F287", component: { label: "3", style: 1 } },
      { type: 1, id: "question_4_1234567890123456789_#57F287", component: { label: "4", style: 1 } }
    ]
  }],
  embed: [{ color: "#57F287", title: "[MATH] What is 2+2?", description: "```\n1 - 3\n2 - 4\n3 - 5\n4 - 6\n```\n(Chọn đáp án đúng tương ứng phía bên dưới!)" }]
}
```

### 2. Sending Quiz to User's DM
**File:** `src/bot/services/quiz.services.ts`  
**Method:** `sendQuizToSingleUser(userInput, botPing, roleSelect)`

**Complete Implementation:**
```typescript
async sendQuizToSingleUser(userInput, botPing = false, roleSelect = null) {
  if (!userInput) return;
  const client = this.clientService.getClient();
  try {
    const userId = userInput.userId; // User ID string
    const user = await client.users.fetch(userId); // Fetch user object
    console.log('sendQuizToSingleUser', userId, user.id, user.dmChannelId);
    
    // ⚠️ CRITICAL: Check if user has a DM channel
    if (!user?.dmChannelId) return; // Exit if no DM channel exists
    
    const q = await this.randomQuiz(userInput, roleSelect);
    if (!q) return;

    // Generate question with DM channel ID (NOT public channel)
    let { mess, components, embed } = this.generateQuestion(
      q,
      user.dmChannelId, // ⭐ Using DM channel ID here
    );
    mess = `${mess}\n(Chọn đáp án đúng tương ứng phía bên dưới!)`;
    
    // Send message to user's DM channel
    const sendMess = await this.komubotrestService.sendMessageKomuToUser(
      mess,
      userId,
      botPing,
      true,
      components, // Buttons included here
      embed,
    );

    if (sendMess) {
      // Save question record with DM channel ID
      await this.saveQuestion(
        userId,
        q.id,
        sendMess.message_id,
        user.dmChannelId, // ⭐ Storing DM channel ID in database
      );
    }
  } catch (error) {
    console.log('Error sendQuizToSingleUser', error, userInput.userId);
    await this.userRepository.update(
      { userId: userInput.userId },
      { botPing: false, user_type: null },
    );
  }
}
```

### 3. Button Click Handler (DM Channel)
**File:** `src/bot/listeners/messagebuttonclick.handle.ts`  
**Method:** `hanndleButtonForm(data)`

**Complete Implementation:**
```typescript
@OnEvent(Events.MessageButtonClicked)
async hanndleButtonForm(data) {
  const userId = data?.user_id; // User who clicked button
  const buttonId = data?.button_id; // Button ID string
  if (!userId || !buttonId) return;
  
  // Prevent spam clicking
  const key = `${userId}:${buttonId}`;
  if (this.processingButtons.get(key)) {
    console.log('Ignore spam click: ', key);
    return;
  }
  this.processingButtons.set(key, true);
  setTimeout(() => this.processingButtons.delete(key), 1000);

  try {
    // Parse button ID to determine type
    const args = buttonId.split('_');
    const buttonConfirmType = args[0]; // First part before underscore
    
    switch (buttonConfirmType) {
      case 'question': // ⭐ Quiz question button
        await this.handleAnswerQuestionWFH(data);
        break;
      // ... other button types (poll, daily, etc.)
    }
  } catch (error) {
    console.log('hanndleButtonForm ERROR', error);
  } finally {
    const key = `${data?.user?.user_id}:${data?.button_id}`;
    this.processingButtons.delete(key);
  }
}
```

**Data Structure for `data` parameter:**
```typescript
// data object structure when button is clicked:
{
  user_id: "1234567890123456789", // User who clicked
  button_id: "question_1_9876543210987654321_#57F287", // Full button ID
  message_id: "111222333444555666", // Message ID where button exists
  channel_id: "9876543210987654321", // DM channel ID (NOT public channel)
  sender_id: "BOT_USER_ID", // Bot's user ID
  extra_data: null // Additional data (null for quiz buttons)
}
```

### 4. Answer Processing & Button Removal (DM Channel)
**File:** `src/bot/listeners/messagebuttonclick.handle.ts`  
**Method:** `handleAnswerQuestionWFH(data)`

**Complete Implementation:**
```typescript
async handleAnswerQuestionWFH(data) {
  try {
    // Parse button ID: "question_{answer}_{channelDmId}_{color}"
    const args = data.button_id.split('_');
    if (args[0] !== 'question') return;
    
    // Extract answer number (1, 2, 3, or 4)
    const answer = args[1]; // "1", "2", "3", or "4"
    
    // ⚠️ CRITICAL: Fetch user to get DM channel ID
    const user = await this.client.users.fetch(data.user_id);
    const channelDmId = user.dmChannelId; // ⭐ DM channel ID (NOT public channel)
    const color = args[3] || '#57F287'; // Color from button ID
    
    // Update user bot ping status
    await this.userRepository.update(
      { userId: data.user_id },
      { botPing: false },
    );
    
    // Find the quiz record using DM channel ID and message ID
    const userQuiz = await this.userQuizRepository
      .createQueryBuilder()
      .where('"channel_id" = :channel_id', {
        channel_id: channelDmId, // ⭐ Using DM channel ID
      })
      .andWhere('"message_id" = :mess_id', {
        mess_id: data.message_id,
      })
      .select('*')
      .getRawOne();
    
    let mess = '';
    const question = await this.quizRepository
      .createQueryBuilder()
      .where('id = :quizId', { quizId: userQuiz?.['quizId'] })
      .select('*')
      .getRawOne();
    
    const messOptions = {};
    
    // Check if already answered
    if (userQuiz?.['answer']) {
      mess = `Bạn đã trả lời câu hỏi này rồi`; // "You already answered"
    } else {
      if (question) {
        // Validate answer format
        if (!checkAnswerFormat(answer, question['options'].length)) {
          mess = `Bạn vui lòng trả lời đúng số thứ tự các đáp án câu hỏi`;
        } else {
          // Check if answer is correct
          const correctAnser = Number(answer) === Number(question['correct']);
          
          if (correctAnser) {
            // Correct answer - add score
            const newUser = await this.quizService.addScores(
              userQuiz['userId'],
            );
            if (!newUser) return;
            mess = `Correct!!!, you have ${newUser[0].scores_quiz} points`;
            await this.quizService.saveQuestionCorrect(
              userQuiz['userId'],
              userQuiz['quizId'],
              Number(answer),
            );
          } else {
            // Incorrect answer
            mess = `Incorrect!!!, The correct answer is ${question['correct']}`;
            await this.quizService.saveQuestionInCorrect(
              userQuiz['userId'],
              userQuiz['quizId'],
              Number(answer),
            );
          }

          // Create feedback embed
          const link = `https://quiz.nccsoft.vn/question/update/${userQuiz['quizId']}`;
          messOptions['embed'] = [
            {
              color: `${correctAnser ? '#1E9F2E' : '#ff0101'}`,
              title: `${mess}`,
            },
            {
              color: `${'#ff0101'}`,
              title: `Complain`,
              url: link,
            },
          ];
        }
      }
    }
    
    // Prepare message reference
    const KOMU = await this.userRepository.findOne({
      where: { userId: process.env.BOT_KOMU_ID },
    });
    const msg: ChannelMessage = {
      message_id: data.message_id,
      id: '',
      channel_id: channelDmId, // ⭐ DM channel ID
      channel_label: '',
      code: EMessageMode.DM_MESSAGE, // ⭐ DM_MESSAGE mode (NOT channel message)
      create_time: '',
      sender_id: process.env.BOT_KOMU_ID,
      username: KOMU.username || 'KOMU',
      avatar: KOMU.avatar,
      content: { t: '' },
      attachments: [{}],
    };
    
    // Prepare feedback message to send separately
    const messageToUser: ReplyMezonMessage = {
      userId: data.user_id,
      textContent: userQuiz?.['answer'] ? mess : '',
      messOptions: messOptions,
      attachments: [],
      refs: refGenerate(msg),
    };
    
    // Create updated embed WITHOUT buttons
    const title = question.topic
      ? `[${question.topic.toUpperCase()}] ${question.title}`
      : question.title;
    const embed = [
      {
        color: color,
        title: `${title}`,
        description:
          '```' +
          `${question.options
            .map((otp, index) => {
              return `${index + 1} - ${otp}`;
            })
            .join('\n')}` +
          '' +
          '```' +
          '\n(Câu hỏi đã được trả lời)', // "Question has been answered"
      },
    ];
    
    // ⭐⭐⭐ CRITICAL: Fetch DM channel and update message ⭐⭐⭐
    // This is where buttons are removed!
    const channel = await this.client.channels.fetch(channelDmId); // ⭐ DM channel
    const message = await channel.messages.fetch(data.message_id);
    
    // ⭐⭐ KEY MECHANISM: Update with ONLY embed, NO components ⭐⭐
    // Omitting 'components' field causes all buttons to be removed
    await message.update({ embed }); // ⭐ No 'components' field = buttons removed!
    
    // Send separate feedback message
    this.messageQueue.addMessage(messageToUser);
  } catch (error) {
    await this.userRepository.update(
      { userId: data.user_id },
      { botPing: false },
    );
    const user = await this.client.users.fetch(data.user_id);
    await user.sendDM({
      t: 'Có lỗi xảy ra khi trả lời câu hỏi. Bạn được tính là đã trả lời câu hỏi này!',
    });
    console.log('Error handleMessageButtonClicked', error);
  }
}
```

## How It Works (DM Channel Flow)

### Step-by-Step Process:

1. **Initial State (DM Channel):**
   - Quiz question is sent to user's DM channel (NOT public channel)
   - Message contains: `{ embed, components }` (with buttons 1, 2, 3, 4)
   - Message is stored in database with `channel_id = user.dmChannelId`

2. **User Clicks Button (in DM):**
   - Button click event is captured with `data.channel_id` = DM channel ID
   - Button ID is parsed: `question_{answer}_{dmChannelId}_{color}`
   - Handler fetches user object to get `user.dmChannelId`
   - Answer is processed and validated
   - User's answer is saved to database

3. **Message Update (DM Channel):**
   - DM channel is fetched: `await this.client.channels.fetch(channelDmId)`
   - Original message is fetched: `await channel.messages.fetch(data.message_id)`
   - Message is updated with: `{ embed }` (components are NOT included)
   - **Result:** Buttons disappear because components are omitted
   - **Location:** This happens in the user's DM channel, not a public channel

4. **Feedback:**
   - A separate message is sent to the user's DM with the result (correct/incorrect)

## Technical Details

### Why Buttons Disappear

In the Mezon SDK (and similar messaging platforms like Discord), when you update a message:
- **If you include `components`:** The buttons are replaced with the new components
- **If you omit `components`:** The existing buttons are removed

This is the standard behavior of message component systems - omitting a field means "remove it."

**Critical Code Line:**
```typescript
// Line 330 in messagebuttonclick.handle.ts
await message.update({ embed }); // ⭐ No 'components' = buttons removed
```

### Button ID Format (DM Channel Specific)

Buttons are created with this ID format:
```
question_{answer_number}_{channelDmId}_{color}
```

**Example:** `question_1_9876543210987654321_#57F287`
- `question` - identifies it as a quiz question button
- `1` - the answer number (1, 2, 3, or 4)
- `9876543210987654321` - **the DM channel ID** (NOT a public channel ID)
- `#57F287` - a random color identifier

**Important:** The `channelDmId` in the button ID is the user's DM channel ID, which is obtained from `user.dmChannelId` when the question is generated.

### DM Channel ID Retrieval

**When sending quiz:**
```typescript
const user = await client.users.fetch(userId);
const channelDmId = user.dmChannelId; // ⭐ DM channel ID
if (!user?.dmChannelId) return; // Exit if no DM channel
```

**When processing button click:**
```typescript
const user = await this.client.users.fetch(data.user_id);
const channelDmId = user.dmChannelId; // ⭐ DM channel ID (same as in button)
const channel = await this.client.channels.fetch(channelDmId); // Fetch DM channel
```

### Preventing Duplicate Answers

The system checks if a user has already answered:
```typescript
// Line 243 in messagebuttonclick.handle.ts
if (userQuiz?.['answer']) {
  mess = `Bạn đã trả lời câu hỏi này rồi`; // "You have already answered this question"
}
```

However, the buttons are still removed even if the user tries to answer again, because the message update happens regardless. The message update always removes buttons, but duplicate answers are prevented by the database check.

## Code Locations Summary

| Component | File | Lines | DM Channel Usage |
|-----------|------|-------|------------------|
| Quiz Generation | `src/bot/services/quiz.services.ts` | 136-178 | Uses `user.dmChannelId` |
| Send Quiz to DM | `src/bot/services/quiz.services.ts` | 94-134 | Sends to `user.dmChannelId` |
| Button Click Handler | `src/bot/listeners/messagebuttonclick.handle.ts` | 134-210 | Routes to handler |
| Answer Processing | `src/bot/listeners/messagebuttonclick.handle.ts` | 212-345 | Uses `user.dmChannelId` |
| **Message Update (Button Removal)** | `src/bot/listeners/messagebuttonclick.handle.ts` | **328-330** | **Updates DM message** |

## Key Takeaway

**The buttons are removed by updating the DM message without including the `components` field in the update payload.** 

**Critical Code:**
```typescript
// Line 328-330 in messagebuttonclick.handle.ts
const channel = await this.client.channels.fetch(channelDmId); // DM channel
const message = await channel.messages.fetch(data.message_id);
await message.update({ embed }); // ⭐ No components = buttons removed
```

This is a common pattern in message-based UIs where omitting a field in an update operation removes that element from the message. **This only works in DM channels, not public channels.**

## Complete Example Flow Diagram (DM Channel)

```
1. System sends quiz to user's DM
    ↓
   user.dmChannelId = "9876543210987654321"
   Message sent to DM with: { embed: [...], components: [buttons 1,2,3,4] }
    ↓
2. User clicks button "1" in their DM
    ↓
   Button ID: "question_1_9876543210987654321_#57F287"
   Event: MessageButtonClicked
    ↓
3. Handler processes click
    ↓
   Fetch user: await client.users.fetch(userId)
   Get DM channel: channelDmId = user.dmChannelId
   Parse answer: answer = "1"
    ↓
4. Answer validation and database save
    ↓
   Check if already answered
   Validate answer format
   Check if correct (answer === question.correct)
   Save to database
    ↓
5. Update message in DM channel
    ↓
   Fetch DM channel: await client.channels.fetch(channelDmId)
   Fetch message: await channel.messages.fetch(message_id)
   Update: await message.update({ embed }) // ⭐ NO components
    ↓
6. Buttons automatically removed
    ↓
   Message now shows: { embed: [...] } only
   Buttons 1, 2, 3, 4 are gone
    ↓
7. Send feedback message to DM
    ↓
   Separate message sent: "Correct!!!, you have X points"
```

## Complete Code Example (Copy-Paste Ready)

Here's a complete, self-contained example showing the button removal mechanism:

```typescript
// ============================================
// COMPLETE EXAMPLE: Button Removal in DM
// ============================================

// 1. INITIAL MESSAGE (with buttons) - sent to DM
const initialMessage = {
  embed: [{
    color: '#57F287',
    title: '[MATH] What is 2+2?',
    description: '```\n1 - 3\n2 - 4\n3 - 5\n4 - 6\n```\n(Chọn đáp án đúng...)'
  }],
  components: [{ // ⭐ Buttons included here
    components: [
      { type: 1, id: 'question_1_9876543210987654321_#57F287', component: { label: '1', style: 1 } },
      { type: 1, id: 'question_2_9876543210987654321_#57F287', component: { label: '2', style: 1 } },
      { type: 1, id: 'question_3_9876543210987654321_#57F287', component: { label: '3', style: 1 } },
      { type: 1, id: 'question_4_9876543210987654321_#57F287', component: { label: '4', style: 1 } }
    ]
  }]
};

// 2. USER CLICKS BUTTON "1"
const buttonClickData = {
  user_id: '1234567890123456789',
  button_id: 'question_1_9876543210987654321_#57F287',
  message_id: '111222333444555666',
  channel_id: '9876543210987654321', // ⭐ DM channel ID
};

// 3. PROCESS BUTTON CLICK
async function handleButtonClick(data) {
  // Parse button ID
  const args = data.button_id.split('_');
  const answer = args[1]; // "1"
  
  // Get DM channel ID from user object
  const user = await client.users.fetch(data.user_id);
  const channelDmId = user.dmChannelId; // ⭐ "9876543210987654321"
  
  // Process answer (validation, database save, etc.)
  // ... answer processing code ...
  
  // 4. CREATE UPDATED EMBED (NO BUTTONS)
  const updatedEmbed = [{
    color: '#57F287',
    title: '[MATH] What is 2+2?',
    description: '```\n1 - 3\n2 - 4\n3 - 5\n4 - 6\n```\n(Câu hỏi đã được trả lời)'
  }];
  
  // 5. FETCH DM CHANNEL AND MESSAGE
  const channel = await client.channels.fetch(channelDmId); // ⭐ DM channel
  const message = await channel.messages.fetch(data.message_id);
  
  // 6. ⭐⭐⭐ UPDATE MESSAGE WITHOUT COMPONENTS ⭐⭐⭐
  await message.update({ embed: updatedEmbed }); 
  // ⭐ Notice: NO 'components' field = buttons removed!
  
  // Result: Message now has embed only, all buttons (1,2,3,4) are gone
}

// ============================================
// KEY MECHANISM:
// ============================================
// When you call: message.update({ embed })
// The SDK removes all components (buttons) because
// the 'components' field is not included in the update.
//
// This works in DM channels only, not public channels.
```

## Related Patterns

This same pattern is used in other parts of the codebase:
- Poll voting (see `poll.service.ts`) - also uses DM channels
- Daily submission forms - uses DM channels
- Absence day requests - uses DM channels
- Other interactive message features - mostly DM channels

All follow the same principle: **update the message without components to remove buttons, and this works in DM channels.**

## Important Notes for Implementation

1. **DM Channel Required:** Always use `user.dmChannelId`, never public channel IDs
2. **Check DM Exists:** Always verify `if (!user?.dmChannelId) return;` before sending
3. **Message Mode:** Use `EMessageMode.DM_MESSAGE` when creating message references
4. **Button ID Format:** Include `channelDmId` in button ID for proper routing
5. **Update Without Components:** Always omit `components` field when updating to remove buttons

