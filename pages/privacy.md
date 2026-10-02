---
title: Privacy
date: 2026-04-28T11:00:00.000Z
permalink: /privacy/index.html
eleventyNavigation:
  key: Privacy
  order: 4
---

# Your Privacy on The Wasp Alloy

When it comes to **The Wasp Alloy** itself, no personal data whatsoever is collected. This website is built using a performance-first philosophy - no personal information is required to access the analysis and research provided here.

## Read Status and View Counts
The Wasp Alloy stores a variable in your local browser to determine which articles you have read. This variable serves only to ensure the view count on each post is accurate and does not increment every time you refresh the page.

**This does NOT include any identifiable information, such as your IP address, country of residence, or any personal details, with NO exceptions.**

Think of it as a checker which asks your browser:

> *"Hey Browser, have you seen this post before?"*

If the answer is no, the checker then replies:

> *"Okay, you are new here, so I'm going to add 1 view to the post."*

Analogically, if the answer is yes, the checker says:

> *"Okay, you have seen this post, so the view count won't be changed."*

The exact same principle is utilized for:
- The Outline Toggle;
- The Dark Mode Toggle;
- The Dyslexia Toggle.

All of these cosmetic changes are saved as a local storage variable. This is why switching devices or even just browsers will not let your personal customization settings carry over.

{% comment %}
***

## Monetization and Third-Parties
To support the ongoing research, documentation, and geopolitical analysis hosted on this domain, The Wasp Alloy utilizes the **A-Ads (Anonymous Ads)** network for monetization. 

I have specifically chosen A-Ads because it aligns with the values of privacy and autonomy. 
- **No Cookies:** A-Ads does not utilize cookies to track your behavior or build a personal profile. 
- **No Behavioral Tracking:** Unlike mainstream ad networks, A-Ads does not follow you across the internet. It utilizes contextual advertising, meaning the ads you see are based on the content of The Wasp Alloy, not your personal browsing history.
- **Technical Metadata:** When your browser requests an advertisement, it automatically sends standard technical metadata (such as your IP address and browser type) to the A-Ads servers to facilitate the delivery of the banner. This is a fundamental technical requirement for all web requests in general, and is not used by The Wasp Alloy to identify individual readers.

By using this site, you acknowledge that this technical interaction occurs, while remaining assured that your personal identity remains private and your browsing habits are not being harvested.
{% endcomment %}

***

## Comment Threads and Federated Authentication
The Wasp Alloy features an interactive, decentralized discussion engine. True to our privacy-first engineering, **The Wasp Alloy does not maintain an account database, collects zero email addresses, and stores zero passwords.**

Instead of forcing you to create yet another vulnerable account on the internet, our platform utilizes **Stateless Federated Authentication** via trusted identity providers (GitHub, Discord, and Instagram). Other providers will be supported soon.

**In simple terms - you are essentially extending the functionality of your existing profile to comment on The Wasp Alloy; you're not creating a new one.**

### What Happens When You Sign In
When you click to sign in, the authentication handshake is handled directly and securely on the servers of GitHub, Discord, or Meta. We never see your password, and we never request access to your private data, emails, or personal contacts.

### What We Store
To display your comments and ratings on the website, our serverless database (Neon PostgreSQL) stores strictly:
- The text content of your comment;
- The public display name and handle provided by your chosen platform;
- The timestamp of posting;
- Your public profile link and avatar URL (rendered via public platform endpoints/CDNs);
- Community star ratings submitted by your verified session.

### What We NEVER Store
- **No Passwords:** We do not have user credentials, making credential leaks or password breaches physically impossible on this site.
- **No Email Addresses:** Your email remains private with your provider.
- **No Tracking Cookies:** Your login state is maintained using a stateless, cryptographically signed session token (HMAC-SHA256) stored strictly in your browser's local storage. It does not track you across the web and expires automatically.

You maintain full sovereignty over your words - you can delete your own comments at any time, which permanently purges your text from our database.

If you are still unsure, you may peruse an example extracted from Sufian M'Barki's comments posted under his Instagram profile. The table below includes both a deleted comment and a public comment:

![Sufian M'Barki Comment Examples](/static/img/data-table-example.png "Sufian M'Barki Comment Examples")