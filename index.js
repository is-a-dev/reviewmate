// Considers main branch as the absolute truth
const utils = require("./utils.js");

WAIT_TIME_AFTER_EACH_FILE = 30000; // In ms
/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  if (!process.env.SCREENSHOTLAYER_KEY || !process.env.IMBB_KEY) {
    throw new Error("Insufficient Environment Variables");
  }
  app.log.info("The app was loaded!");
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
          const imbb = await utils.uploadImageToImgbb(
            screenshot.toString("base64"),
          );
          const imageUrl = imbb.data.url;
          const description = fileContent.description || "N/A";
          const repository = fileContent.repo || "N/A";

          const oldRawFileUrl = file.raw_url.replace(
            /\/[0-9a-f]{40}\//,
            "/main/",
          );
          const oldFile = await utils.getRawFileContent(oldRawFileUrl);
          const newFileOwner = fileContent.owner.username;
          const oldFileOwner = oldFile.owner.username;
          const prOwner = context.payload.pull_request.user.login;
          let authorized = false;
          if (oldFileOwner === prOwner) {
            authorized = true;
          }

          // Create a formatted message or comment
          const commentMessage = `
# 🔍 ReviewMate Analysis
File: [${file.filename}](${file.blob_url})
Content URL: ${url}
Description: ${description}
Repository: ${repository}

## 🔒 Authorization
- Old File Owner: ${oldFileOwner}
- New File Owner: ${newFileOwner}
- PR Author: ${prOwner}

**Authorized**: ${authorized ? "✅" : "❌"}

## 📸 Screenshot
![Screenshot of ${file.filename}](${imageUrl})
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
          const imbb = await utils.uploadImageToImgbb(
            screenshot.toString("base64"),
          );
          const imageUrl = imbb.data.url;
          const description = fileContent.description || "N/A";
          const repository = fileContent.repo || "N/A";
          const commentMessage = `
# 🔍 ReviewMate Analysis
File: [${file.filename}](${file.blob_url})
Content URL: ${url}
Description: ${description}
Repository: ${repository}

## 📸 Screenshot
![Screenshot of ${file.filename}](${imageUrl})
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
# 🔍 ReviewMate Analysis
🗑️ **File Deleted**: [${file.filename}](${file.blob_url})

## 🔒 Authorization
- File Owner: ${oldFileOwner}
- PR Owner: ${prOwner}

**Authorized**: ${authorized ? "✅" : "❌"}
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
