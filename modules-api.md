# Modules API — External Developer Guide

REST API for managing and consuming **Modules** and their full learning hierarchy:

```
Module → Topics → Contents → Questions
```

Use this API to integrate LetsUpgrade learning modules into external apps (learner platforms, mobile apps, internal tools).

---

## Table of Contents

1. [Overview](#overview)
2. [Base URL](#base-url)
3. [Authentication](#authentication)
4. [Response Format](#response-format)
5. [Public vs Admin Access](#public-vs-admin-access)
6. [Modules](#modules)
7. [Topics](#topics)
8. [Contents (Learning Content)](#contents-learning-content)
9. [Questions (Question Bank)](#questions-question-bank)
10. [Full Tree Endpoints](#full-tree-endpoints)
11. [Track Outline Reorder](#track-outline-reorder)
12. [File Uploads](#file-uploads)
13. [Data Models](#data-models)
14. [Error Codes](#error-codes)
15. [Integration Examples](#integration-examples)

---

## Overview

| Layer | Description | Collection |
|-------|-------------|------------|
| **Module** | Top-level learning unit (standalone or attached to a track) | `modules` |
| **Topic** | Section/chapter inside a module | `topics` |
| **Content** | Learning blocks (text, video, code, quiz, etc.) inside a topic | `contents` |
| **Question** | MCQ question bank items for a topic | `questionsBank` |

**Typical read flow for a learner app:**

1. List modules → `GET /modules?standalone=true&active=true`
2. Load module with topics → `GET /modules/:moduleId/full`
3. Or load topic detail → `GET /modules/:moduleId/topics/:topicId/full`

---

## Base URL

```
{BASE_URL}/api/v1
```

| Environment | Example |
|-------------|---------|
| Production | `https://admin.letsupgrade.in/api/v1` |
| Staging | `https://staging-admin.letsupgrade.in/api/v1` |
| Local | `http://localhost:3000/api/v1` |

Replace `{BASE_URL}` with your deployed admin client URL. Confirm the exact production URL with your LetsUpgrade contact before going live.

All requests and responses use **JSON** unless noted otherwise.

---

## Authentication

### Public read (no auth)

Unauthenticated requests can **read** active content only. Sensitive fields (correct answers, explanations) are stripped automatically.

```http
GET /api/v1/modules?standalone=true&active=true
```

### Admin write + full read

Admin operations require a **Bearer token** (same JWT used by the LetsUpgrade admin panel).

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Obtain the token via the LetsUpgrade auth flow (`ACCESS_PATH` / admin login). Contact your LetsUpgrade admin for credentials and token refresh details.

### Required roles

Write endpoints require an admin role permitted by the LetsUpgrade admin panel (content manager / admin roles).

---

## Response Format

### Success — single resource

```json
{
  "success": true,
  "data": { },
  "message": "Module retrieved successfully",
  "error": null
}
```

### Success — list (paginated)

```json
{
  "success": true,
  "items": [ ],
  "total": 42,
  "page": 1,
  "limit": 10,
  "message": "Modules retrieved successfully",
  "error": null
}
```

### Success — create

```json
{
  "success": true,
  "id": "665a1b2c3d4e5f678901234",
  "message": "Module created successfully",
  "error": null
}
```

### Error

```json
{
  "success": false,
  "data": null,
  "error": "Module not found",
  "statusCode": 404
}
```

---

## Public vs Admin Access

| Operation | Public | Admin |
|-----------|--------|-------|
| List / get modules, topics, contents | Yes (active only) | Yes (all) |
| Get questions (without answers) | Yes | Yes |
| Get questions (with answers) | No | Yes |
| Create / update / delete | No | Yes |
| Reorder / status toggle | No | Yes |
| Analytics / enrolled users | No | Yes |

**Fields stripped on public read:**

| Resource | Stripped fields |
|----------|-----------------|
| Questions | `correctAnswer`, `explanation` |
| Content blocks (`quiz` type) | `correctAnswer` |
| Content blocks (`flashcard`, `faq`) | `answer` |

---

## Modules

### List modules

```http
GET /modules
```

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Items per page (max 100) |
| `search` | string | — | Case-insensitive search on title |
| `trackId` | string | — | Filter modules belonging to a track |
| `standalone` | boolean | `false` | `true` = modules not attached to any track |
| `active` | boolean | — | Filter by active status |

**Example**

```http
GET /api/v1/modules?standalone=true&active=true&page=1&limit=20
```

**Example response**

```json
{
  "success": true,
  "items": [
    {
      "_id": "665a1b2c3d4e5f678901234",
      "title": "Introduction to Python",
      "thumbnail": "https://cdn.example.com/python.png",
      "priority": 1,
      "active": true,
      "trackId": null,
      "tags": [
        { "_id": "665a...", "title": "Programming", "slug": "programming" }
      ],
      "suggestedTrackIds": [],
      "certificateTemplate": null,
      "payment": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "message": "Modules retrieved successfully",
  "error": null
}
```

---

### Get one module

```http
GET /modules/:moduleId
```

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `include` | string | Comma-separated: `topics`, `topics.contents`, `topics.questions`, `all` |

**Example**

```http
GET /api/v1/modules/665a1b2c3d4e5f678901234?include=topics
```

---

### Create module

```http
POST /modules
Authorization: Bearer <token>
```

**Request body**

```json
{
  "title": "Introduction to Python",
  "tags": ["665a11111111111111111111"],
  "thumbnail": "https://cdn.example.com/python.png",
  "priority": 1,
  "suggestedTrackIds": ["665a22222222222222222222"],
  "certificateTemplateId": "665a33333333333333333333",
  "trackId": "665a44444444444444444444"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Module title |
| `tags` | No | Array of tag ObjectId strings |
| `thumbnail` | No | Valid image URL |
| `priority` | No | Sort order |
| `suggestedTrackIds` | No | Suggested tracks (standalone modules) |
| `certificateTemplateId` | No | Certificate template ID |
| `trackId` | No | If set, module is added to that track's outline |

**Response:** `201 Created` with `{ "success": true, "id": "..." }`

---

### Update module

```http
PATCH /modules/:moduleId
Authorization: Bearer <token>
```

**Request body:** Same fields as create (partial updates supported).

---

### Delete module

```http
DELETE /modules/:moduleId
Authorization: Bearer <token>
```

**Cascade delete:** Also removes all topics, contents, and questions under this module. Updates track outline if the module was attached to a track.

**Response:** `200 OK`

---

### Toggle module status

```http
PATCH /modules/:moduleId/status
Authorization: Bearer <token>
```

**Request body**

```json
{
  "active": false
}
```

---

### Module analytics

```http
GET /modules/:moduleId/analytics
Authorization: Bearer <token>
```

**Response data**

```json
{
  "enrolledUsers": 120,
  "topicsCount": 8,
  "contentsCount": 45,
  "questionsBankCount": 32
}
```

---

### Module enrolled users

```http
GET /modules/:moduleId/users?page=1&limit=10
Authorization: Bearer <token>
```

**Response data:** Array of enrollment records with populated user profile (`name`, `email`, `coverImageUrl`, `uid`).

---

## Topics

Topics belong to a module. All topic routes are nested under the parent module.

### List topics

```http
GET /modules/:moduleId/topics
```

**Example response**

```json
{
  "success": true,
  "items": [
    {
      "_id": "665b11111111111111111111",
      "title": "Variables and Data Types",
      "moduleId": "665a1b2c3d4e5f678901234",
      "trackId": null,
      "priority": 1,
      "active": true
    }
  ],
  "total": 1,
  "message": "Topics retrieved successfully",
  "error": null
}
```

---

### Get one topic

```http
GET /modules/:moduleId/topics/:topicId
```

---

### Create topic

```http
POST /modules/:moduleId/topics
Authorization: Bearer <token>
```

**Request body**

```json
{
  "title": "Variables and Data Types",
  "trackId": "665a44444444444444444444"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Topic title |
| `trackId` | No | Set when module belongs to a track |

**Response:** `201 Created` with `{ "success": true, "id": "..." }`

---

### Update topic

```http
PATCH /modules/:moduleId/topics/:topicId
Authorization: Bearer <token>
```

**Request body**

```json
{
  "title": "Updated Topic Title"
}
```

---

### Delete topic

```http
DELETE /modules/:moduleId/topics/:topicId
Authorization: Bearer <token>
```

Also deletes all contents and questions under this topic.

---

### Reorder topics

```http
PATCH /modules/:moduleId/topics/priorities
Authorization: Bearer <token>
```

**Request body**

```json
{
  "topicIds": [
    "665b33333333333333333333",
    "665b11111111111111111111",
    "665b22222222222222222222"
  ]
}
```

Topic IDs in array order receive `priority` 1, 2, 3, …

---

### Toggle topic status

```http
PATCH /modules/:moduleId/topics/:topicId/status
Authorization: Bearer <token>
```

**Request body**

```json
{
  "active": true
}
```

---

## Contents (Learning Content)

Content items are ordered learning blocks inside a topic. Each content item has a `title`, optional `description`, and an array of `blocks`.

### List contents

```http
GET /modules/:moduleId/topics/:topicId/contents
```

**Example response**

```json
{
  "success": true,
  "items": [
    {
      "_id": "665c11111111111111111111",
      "title": "What is a Variable?",
      "description": "Introduction to variables",
      "priority": 1,
      "active": true,
      "topicId": "665b11111111111111111111",
      "moduleId": "665a1b2c3d4e5f678901234",
      "blocks": [
        {
          "type": "text",
          "content": "<p>A variable stores data...</p>"
        },
        {
          "type": "media",
          "mediaType": "video",
          "url": "https://cdn.example.com/video.mp4"
        }
      ]
    }
  ],
  "total": 1,
  "message": "Contents retrieved successfully",
  "error": null
}
```

---

### Get one content

```http
GET /modules/:moduleId/topics/:topicId/contents/:contentId
```

---

### Create content

```http
POST /modules/:moduleId/topics/:topicId/contents
Authorization: Bearer <token>
```

**Request body**

```json
{
  "title": "What is a Variable?",
  "description": "Introduction to variables",
  "priority": 1,
  "blocks": [
    {
      "type": "text",
      "content": "<p>A variable stores data in memory.</p>"
    },
    {
      "type": "codeblock",
      "code": "name = \"Alice\"\nprint(name)"
    }
  ],
  "moduleId": "665a1b2c3d4e5f678901234",
  "trackId": null
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Max 200 characters |
| `description` | No | Max 1000 characters |
| `blocks` | Yes | At least 1 block, max 100 blocks |
| `priority` | No | Sort order (default `0`) |
| `moduleId` | No | Parent module ID |
| `trackId` | No | Parent track ID if applicable |

---

### Update content

```http
PATCH /modules/:moduleId/topics/:topicId/contents/:contentId
Authorization: Bearer <token>
```

**Request body:** Any of `title`, `description`, `blocks`, `priority`, `color` (partial update).

---

### Delete content

```http
DELETE /modules/:moduleId/topics/:topicId/contents/:contentId
Authorization: Bearer <token>
```

---

### Reorder contents

```http
PATCH /modules/:moduleId/topics/:topicId/contents/priorities
Authorization: Bearer <token>
```

**Request body**

```json
{
  "updates": [
    { "_id": "665c22222222222222222222", "priority": 1 },
    { "_id": "665c11111111111111111111", "priority": 2 }
  ]
}
```

---

### Toggle content status

```http
PATCH /modules/:moduleId/topics/:topicId/contents/:contentId/status
Authorization: Bearer <token>
```

**Request body**

```json
{
  "active": false
}
```

---

### Content block types

| Type | Required fields | Description |
|------|-----------------|-------------|
| `text` | `content` (string) | Rich text / HTML content |
| `section` | At least one of `title`, `content`, `items` | Section with optional nested items |
| `media` | `mediaType`, `url` | Image, video, or audio |
| `codeblock` | `code` | Code snippet |
| `flashcard` | `question`, `answer` | Flip card (answer hidden on public read) |
| `faq` | `question`, `answer` | FAQ pair (answer hidden on public read) |
| `quiz` | `question`, `items` (array), `correctAnswer` | Inline MCQ (correctAnswer hidden on public read) |

**Example — media block**

```json
{
  "type": "media",
  "mediaType": "video",
  "url": "https://cdn.example.com/intro.mp4"
}
```

**Example — quiz block**

```json
{
  "type": "quiz",
  "question": "Which keyword defines a function in Python?",
  "items": ["func", "def", "function", "fn"],
  "correctAnswer": "def"
}
```

---

## Questions (Question Bank)

MCQ questions for assessments. Separate from inline `quiz` blocks inside content.

### List questions

```http
GET /modules/:moduleId/topics/:topicId/questions
```

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `difficulty` | string | `all` | `easy`, `medium`, `hard`, or `all` |

**Example (public — answers stripped)**

```json
{
  "success": true,
  "data": [
    {
      "_id": "665d11111111111111111111",
      "question": "What is the output of print(2 + 3)?",
      "options": ["23", "5", "6", "Error"],
      "difficulty": "easy",
      "priority": 1,
      "topicId": "665b11111111111111111111",
      "moduleId": "665a1b2c3d4e5f678901234"
    }
  ],
  "message": "Questions retrieved successfully",
  "error": null
}
```

**Example (admin — full data)**

```json
{
  "_id": "665d11111111111111111111",
  "question": "What is the output of print(2 + 3)?",
  "options": ["23", "5", "6", "Error"],
  "correctAnswer": "5",
  "explanation": "2 + 3 evaluates to 5",
  "difficulty": "easy",
  "priority": 1
}
```

---

### Get one question

```http
GET /modules/:moduleId/topics/:topicId/questions/:questionId
```

---

### Create question

```http
POST /modules/:moduleId/topics/:topicId/questions
Authorization: Bearer <token>
```

**Request body**

```json
{
  "question": "What is the output of print(2 + 3)?",
  "options": ["23", "5", "6", "Error"],
  "correctAnswer": "5",
  "explanation": "2 + 3 evaluates to 5",
  "difficulty": "easy",
  "moduleId": "665a1b2c3d4e5f678901234",
  "trackId": null
}
```

| Field | Required | Constraints |
|-------|----------|-------------|
| `question` | Yes | 10–1000 characters |
| `options` | Yes | Exactly 4 non-empty strings |
| `correctAnswer` | Yes | Must match one of the options |
| `explanation` | No | Optional explanation |
| `difficulty` | No | `easy`, `medium`, or `hard` (default `easy`) |

---

### Bulk create questions

```http
POST /modules/:moduleId/topics/:topicId/questions/bulk
Authorization: Bearer <token>
```

**Request body**

```json
{
  "questions": [
    {
      "question": "What is a list in Python?",
      "options": ["A mutable sequence", "A function", "A loop", "A keyword"],
      "correctAnswer": "A mutable sequence",
      "difficulty": "easy"
    },
    {
      "question": "Which method adds an item to a list?",
      "options": ["add()", "append()", "push()", "insert()"],
      "correctAnswer": "append()",
      "difficulty": "medium"
    }
  ]
}
```

Priorities are auto-assigned sequentially. `topicId` and `moduleId` are set from the URL path.

**Response:** `201 Created` with array of created questions in `data`.

---

### Update question

```http
PATCH /modules/:moduleId/topics/:topicId/questions/:questionId
Authorization: Bearer <token>
```

**Request body:** Same fields as create (partial updates supported).

---

### Delete question

```http
DELETE /modules/:moduleId/topics/:topicId/questions/:questionId
Authorization: Bearer <token>
```

---

## Full Tree Endpoints

Use these when you need the entire module structure in one request (recommended for learner apps).

### Full module tree

```http
GET /modules/:moduleId/full
```

Returns module → topics → contents → questions in a single response.

**Public read:** Only active items; answers stripped from questions and quiz blocks.

**Example response shape**

```json
{
  "success": true,
  "data": {
    "_id": "665a1b2c3d4e5f678901234",
    "title": "Introduction to Python",
    "active": true,
    "topics": [
      {
        "_id": "665b11111111111111111111",
        "title": "Variables",
        "priority": 1,
        "active": true,
        "contents": [
          {
            "_id": "665c11111111111111111111",
            "title": "What is a Variable?",
            "priority": 1,
            "blocks": [ ]
          }
        ],
        "questions": [ ]
      }
    ]
  },
  "message": "Module tree retrieved successfully",
  "error": null
}
```

---

### Full topic tree

```http
GET /modules/:moduleId/topics/:topicId/full
```

Returns a single topic with its contents and questions.

---

### Include query parameter (alternative)

Instead of `/full`, you can use `include` on the module GET endpoint:

```http
GET /modules/:moduleId?include=topics,topics.contents,topics.questions
```

| Value | Includes |
|-------|----------|
| `topics` | Topics only |
| `topics.contents` | Topics + contents |
| `topics.questions` | Topics + questions |
| `all` | Topics + contents + questions |

---

## Track Outline Reorder

When modules are part of a track outline (alongside projects, payments, certificates):

```http
PATCH /tracks/:trackId/outline/priorities
Authorization: Bearer <token>
```

**Request body**

```json
{
  "outlineIds": [
    { "_id": "665a1b2c3d4e5f678901234", "type": "module", "priority": 1 },
    { "_id": "665e11111111111111111111", "type": "project", "priority": 2 },
    { "_id": "665f11111111111111111111", "type": "payment", "priority": 3 }
  ]
}
```

| `type` values | `module`, `project`, `payment`, `certificate` |

---

## File Uploads

Thumbnail and media uploads use the existing LetsUpgrade upload service (not part of `/api/v1`).

```http
POST {NEXT_PUBLIC_API_URL}/v4/upload/file
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Value |
|-------|-------|
| `file` | The file to upload |
| `resource` | `"modules"` (for module thumbnails) |

Use the returned URL in `thumbnail` (modules) or inside content `media` blocks.

---

## Data Models

### Module

```json
{
  "_id": "string (ObjectId)",
  "title": "string",
  "tags": [{ "_id": "string", "title": "string", "slug": "string" }],
  "thumbnail": "string (URL) | null",
  "priority": "number",
  "suggestedTrackIds": [{ "_id": "string", "title": "string", "slug": "string" }],
  "certificateTemplate": { "_id": "string", "templateId": "string", "link": "string" } | null,
  "payment": { "_id": "string", "amount": "number", "currency": "string", "title": "string" } | null,
  "trackId": "string (ObjectId) | null",
  "paymentId": "string (ObjectId) | null",
  "certificateTemplateId": "string (ObjectId) | null",
  "active": "boolean",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime",
  "createdBy": "string (admin uid)",
  "updatedBy": "string (admin uid)"
}
```

### Topic

```json
{
  "_id": "string (ObjectId)",
  "title": "string",
  "moduleId": "string (ObjectId)",
  "trackId": "string (ObjectId) | null",
  "priority": "number",
  "active": "boolean",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

### Content

```json
{
  "_id": "string (ObjectId)",
  "title": "string",
  "description": "string | null",
  "priority": "number",
  "blocks": "array of block objects",
  "topicId": "string (ObjectId)",
  "moduleId": "string (ObjectId)",
  "trackId": "string (ObjectId) | null",
  "active": "boolean",
  "color": "string | null",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

### Question

```json
{
  "_id": "string (ObjectId)",
  "question": "string",
  "options": ["string", "string", "string", "string"],
  "correctAnswer": "string (admin only)",
  "explanation": "string (admin only)",
  "difficulty": "easy | medium | hard",
  "priority": "number",
  "topicId": "string (ObjectId)",
  "moduleId": "string (ObjectId)",
  "trackId": "string (ObjectId) | null",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

---

## Error Codes

| HTTP Status | Meaning | Example |
|-------------|---------|---------|
| `200` | Success | Resource retrieved or updated |
| `201` | Created | Module/topic/content/question created |
| `400` | Bad Request | Invalid body, validation failed |
| `401` | Unauthorized | Missing or invalid token |
| `403` | Forbidden | Insufficient role |
| `404` | Not Found | Resource does not exist |
| `500` | Internal Server Error | Unexpected server error |

**Common validation errors**

| Error | Cause |
|-------|-------|
| `Invalid module ID format` | `moduleId` is not a valid MongoDB ObjectId |
| `Module not found` | No module with that ID |
| `Title is required` | Missing or empty title |
| `Content must have at least one block` | Empty `blocks` array |
| `Must have exactly 4 options` | Question options array length ≠ 4 |
| `One or more blocks have invalid structure` | Block missing required fields for its type |

---

## Integration Examples

### Fetch a full module for a learner app (JavaScript)

```javascript
const BASE_URL = "https://admin.letsupgrade.in/api/v1"

async function loadModule(moduleId) {
  const res = await fetch(`${BASE_URL}/modules/${moduleId}/full`)
  const json = await res.json()

  if (!json.success) {
    throw new Error(json.error)
  }

  return json.data
}

// Usage
const module = await loadModule("665a1b2c3d4e5f678901234")
console.log(module.title, module.topics.length)
```

---

### List standalone modules (cURL)

```bash
curl -X GET "https://admin.letsupgrade.in/api/v1/modules?standalone=true&active=true&page=1&limit=20"
```

---

### Create a module (cURL, admin)

```bash
curl -X POST "https://admin.letsupgrade.in/api/v1/modules" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Introduction to Python",
    "tags": [],
    "suggestedTrackIds": []
  }'
```

---

### Create topic + content flow (admin)

```bash
# 1. Create topic
curl -X POST "https://admin.letsupgrade.in/api/v1/modules/MODULE_ID/topics" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Variables" }'

# 2. Add learning content to topic
curl -X POST "https://admin.letsupgrade.in/api/v1/modules/MODULE_ID/topics/TOPIC_ID/contents" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "What is a Variable?",
    "blocks": [
      { "type": "text", "content": "<p>Variables store data.</p>" }
    ]
  }'

# 3. Bulk add questions
curl -X POST "https://admin.letsupgrade.in/api/v1/modules/MODULE_ID/topics/TOPIC_ID/questions/bulk" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "questions": [
      {
        "question": "Which of these is a valid variable name?",
        "options": ["2name", "my_var", "class", "for"],
        "correctAnswer": "my_var",
        "difficulty": "easy"
      }
    ]
  }'
```

---

### Python example

```python
import requests

BASE_URL = "https://admin.letsupgrade.in/api/v1"

def get_module_tree(module_id: str) -> dict:
    response = requests.get(f"{BASE_URL}/modules/{module_id}/full")
    response.raise_for_status()
    data = response.json()
    if not data["success"]:
        raise Exception(data["error"])
    return data["data"]

module = get_module_tree("665a1b2c3d4e5f678901234")
for topic in module["topics"]:
    print(f"{topic['title']}: {len(topic['contents'])} contents, {len(topic['questions'])} questions")
```

---

## Endpoint Reference (Quick Index)

| Method | Endpoint | Auth |
|--------|----------|------|
| `GET` | `/modules` | Public / Admin |
| `GET` | `/modules/:moduleId` | Public / Admin |
| `GET` | `/modules/:moduleId/full` | Public / Admin |
| `POST` | `/modules` | Admin |
| `PATCH` | `/modules/:moduleId` | Admin |
| `DELETE` | `/modules/:moduleId` | Admin |
| `PATCH` | `/modules/:moduleId/status` | Admin |
| `GET` | `/modules/:moduleId/analytics` | Admin |
| `GET` | `/modules/:moduleId/users` | Admin |
| `GET` | `/modules/:moduleId/topics` | Public / Admin |
| `GET` | `/modules/:moduleId/topics/:topicId` | Public / Admin |
| `GET` | `/modules/:moduleId/topics/:topicId/full` | Public / Admin |
| `POST` | `/modules/:moduleId/topics` | Admin |
| `PATCH` | `/modules/:moduleId/topics/:topicId` | Admin |
| `DELETE` | `/modules/:moduleId/topics/:topicId` | Admin |
| `PATCH` | `/modules/:moduleId/topics/priorities` | Admin |
| `PATCH` | `/modules/:moduleId/topics/:topicId/status` | Admin |
| `GET` | `/modules/:moduleId/topics/:topicId/contents` | Public / Admin |
| `GET` | `/modules/:moduleId/topics/:topicId/contents/:contentId` | Public / Admin |
| `POST` | `/modules/:moduleId/topics/:topicId/contents` | Admin |
| `PATCH` | `/modules/:moduleId/topics/:topicId/contents/:contentId` | Admin |
| `DELETE` | `/modules/:moduleId/topics/:topicId/contents/:contentId` | Admin |
| `PATCH` | `/modules/:moduleId/topics/:topicId/contents/priorities` | Admin |
| `PATCH` | `/modules/:moduleId/topics/:topicId/contents/:contentId/status` | Admin |
| `GET` | `/modules/:moduleId/topics/:topicId/questions` | Public / Admin |
| `GET` | `/modules/:moduleId/topics/:topicId/questions/:questionId` | Public / Admin |
| `POST` | `/modules/:moduleId/topics/:topicId/questions` | Admin |
| `POST` | `/modules/:moduleId/topics/:topicId/questions/bulk` | Admin |
| `PATCH` | `/modules/:moduleId/topics/:topicId/questions/:questionId` | Admin |
| `DELETE` | `/modules/:moduleId/topics/:topicId/questions/:questionId` | Admin |
| `PATCH` | `/tracks/:trackId/outline/priorities` | Admin |

---

## Support

For API access credentials, production base URL confirmation, or rate limit questions, contact your LetsUpgrade platform administrator.

**Version:** `v1`  
**Last updated:** May 2025
