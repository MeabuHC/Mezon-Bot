# Mailzon - Email Alert Bot

Mailzon is a text-based bot that allows users to subscribe to email alerts via OAuth login (e.g., Gmail).

## Create your Mezon application

Visit the [Developers Portal](https://dev-developers.nccsoft.vn/) to create your application.

## Add bot to your clan

Use your install link in a browser to add your bot to your desired clan.

## Installation

```bash
$ yarn
```

Copy `.env.example` to `.env` and replace it with your application token and OAuth credentials.

## Running the app

```bash
# development
$ yarn start
```

## Features

- OAuth-based Gmail authentication
- Email alert subscriptions
- Secure token storage
- Automatic token refresh