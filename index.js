// Considers main branch as the absolute truth
const utils = require("./utils.js");
const path = require('path');
const fetch = require('node-fetch');

const WAIT_TIME_AFTER_EACH_FILE = 30000; // 30 seconds
const IGNORE_LABELS = ["maintainer"];
const IGNORE_TITLES = ["no-rm", "rm-skip"];
const HOSTING_MAIN_IP = "217.174.245.249"
const ACTIVATE_HOSTING_ENDPOINT = "https://hosts.is-a.dev/api/activate"
const PR_MERGED_CONTENT_LINK =
  "https://raw.githubusercontent.com/is-a-dev/team-docs/main/pr-merged.md";

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  if (!process.env.SCREENSHOTLAYER_KEY)
    throw new Error("Missing Environment Variable: SCREENSHOTLAYER_KEY");
  if (!process.env.IMGBB_KEY)
    throw new Error("Missing Environment Variable: IMGBB_KEY");
  if (!process.env.HOSTING_TOKEN)
    throw new Error("Missing Environment Variable: HOSTING_TOKEN");

  app.log.info("The app was loaded!");
  app.on(["pull_request.closed"], async (context) => {
    if (context.payload.pull_request.merged !== true) {
      return;
    }
    const { owner, repo, pull_number } = context.pullRequest();

    // Activate is-a-dev Hosting if the domain uses it
    const { data: changedFiles } = await context.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number,
    });

    for (const file of changedFiles) {
      if (file.status != "added" && file.status != "renamed") {
        continue;
      }
      const fileContent = await utils.getRawFileContent(file.raw_url);
      if (!fileContent.record) {
        continue;
      }
      if (!fileContent.record.A) {
        continue;
      }
      if (!fileContent.record.A.includes(HOSTING_MAIN_IP)) {
        continue;
      }
      const url = new URL(ACTIVATE_HOSTING_ENDPOINT);
      const subdomain = path.basename(file.filename, '.json');
      url.searchParams.append('domain', subdomain);
      url.searchParams.append('NOTIFY_TOKEN', process.env.HOSTING_TOKEN);
      const response = await fetch(url);
      app.log.info(`Activated Hosting for ${subdomain}. Status: ${response.status}`)
    }

    // Send Pull Request Merged Message
    const pr_merged_message = await utils.getRawFileContent(
      PR_MERGED_CONTENT_LINK,
    );
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: pr_merged_message,
    });
  });
  app.on(
    [
      "pull_request.opened",
      "pull_request.synchronize",
      "pull_request.ready_for_review",
    ],
    async (context) => {
      const { owner, repo, pull_number } = context.pullRequest();
      const { data: changedFiles } = await context.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number,
      });

      labels = await context.octokit.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: pull_number,
      });

      labels = labels.data.map((label) => label.name);

      if (IGNORE_LABELS.some((label) => labels.includes(label))) return;

      const title = context.payload.pull_request.title;

      if (IGNORE_TITLES.some((ignore_title) => title.includes(ignore_title)))
        return;

      for (const file of changedFiles) {
        if (
          file.status === "modified" ||
          file.status === "renamed" ||
          file.status === "changed"
        ) {
          // Get the actual file content
          const fileContent = await utils.getRawFileContent(file.raw_url);

          let url;
          if ("CNAME" in fileContent.record) {
            url = `http://${fileContent.record.CNAME}`;
          } else if ("URL" in fileContent.record) {
            url = fileContent.record.URL;
          } else {
            continue;
          }

          const screenshot = await utils.screenshotUrl(url);
          const imgbb = await utils.uploadImageToImgbb(
            screenshot.toString("base64"),
          );
          const imageUrl = imgbb.data.url;
          const description = fileContent.description || "N/A";
          const repository = fileContent.repo || "N/A";

          const oldRawFileUrl = file.raw_url.replace(
            /\/[0-9a-f]{40}\//,
            "/main/",
          );
          const oldFile = await utils.getRawFileContent(oldRawFileUrl);
          const oldFileOwner = oldFile.owner.username;
          const newFileOwner = fileContent.owner.username;
          const prOwner = context.payload.pull_request.user.login;

          let authorized = false;

          if (
            oldFileOwner.toLowerCase() === prOwner.toLowerCase() ||
            (newFileOwner.toLowerCase() &&
              oldFileOwner.toLowerCase() === prOwner.toLowerCase())
          ) {
            authorized = true;
          }

          // Create a formatted message or comment
          const commentMessage = `
## 🔍 ReviewMate Analysis
File: [${file.filename}](${file.blob_url})
Content URL: ${url}

## ${authorized ? "🔒 Authorized" : "🔓 Unauthorized"}
${
  authorized
    ? ""
    : `**File Owner**: ${oldFileOwner}\n${
        newFileOwner ? `**New File Owner**: ${newFileOwner}` : ""
      }\n**PR Author**: ${prOwner}`
}

<details>
<summary><h3>📸 Screenshot</h3></summary>

![${file.filename}](${imageUrl})
</details>
`;

          // Post the comment to the GitHub pull request
          await context.octokit.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: commentMessage,
          });
        } else if (file.status === "added") {
          // Get the actual file content
          const fileContent = await utils.getRawFileContent(file.raw_url);

          let url;

          if ("CNAME" in fileContent.record) {
            url = `http://${fileContent.record.CNAME}`;
          } else if ("URL" in fileContent.record) {
            url = fileContent.record.URL;
          } else {
            continue;
          }

          // Capture a screenshot of the content as if it were a webpage (assuming HTML content)
          const screenshot = await utils.screenshotUrl(url);
          const imgbb = await utils.uploadImageToImgbb(
            screenshot.toString("base64"),
          );
          const imageUrl = imgbb.data.url;
          const description = fileContent.description || "N/A";
          const repository = fileContent.repo || "N/A";
          const commentMessage = `
## 🔍 ReviewMate Analysis
File: [${file.filename}](${file.blob_url})
Content URL: ${url}

<details>
<summary><h3>📸 Screenshot</h3></summary>

![${file.filename}](${imageUrl})
</details>
`;

          // Post the comment to the GitHub pull request
          await context.octokit.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: commentMessage,
          });
        } else {
          const oldRawFileUrl = file.raw_url.replace(
            /\/[0-9a-f]{40}\//,
            "/main/",
          );
          const oldFile = await utils.getRawFileContent(oldRawFileUrl);
          const oldFileOwner = oldFile.owner.username;
          const prOwner = context.payload.pull_request.user.login;

          let authorized = false;

          if (oldFileOwner === prOwner) {
            authorized = true;
          }

          const commentMessage = `
## 🔍 ReviewMate Analysis
🗑️ **File Deleted**: [${file.filename}](${file.blob_url})

## ${authorized ? "🔒 Authorized" : "🔓 Unauthorized"}
${
  authorized ? "" : `**File Owner**: ${oldFileOwner}\n**PR Author**: ${prOwner}`
}
`;

          // Post the comment to the GitHub pull request
          await context.octokit.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: commentMessage,
          });

          await new Promise((r) => setTimeout(r, WAIT_TIME_AFTER_EACH_FILE)); // For Screenshotlayer API ratelimit (2 req / minute)
        }
      }
    },
  );
};
