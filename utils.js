const axios = require("axios");
const FormData = require("form-data");

const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const SCREENSHOTLAYER_API_URL = "http://api.screenshotlayer.com/api/capture";
const SCREENSHOTLAYER_DELAY = "3"; // Delay before capturing screenshot: MUST BE STRING
const SCREENSHOTLAYER_FORCE = "1"; // Force a fresh screenshot (0: false, 1: true): MUST BE STRING
const GET_FILE_MAX_RETRIES = 2; // Max retries while fetching raw file

async function getRawFileContent(
  rawFileUrl,
  maxRetries = GET_FILE_MAX_RETRIES,
) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await axios.get(rawFileUrl);

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(
          `Failed to fetch the file. Status code: ${response.status}`,
        );
      }
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw new Error(
          `Error fetching the file after ${maxRetries} retries: ${error.message}`,
        );
      }
      // Wait for a short time before retrying (e.g., 1 second)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(
    `Max retries (${maxRetries}) exceeded. Unable to fetch the file.`,
  );
}

async function getAllFilesContent(rawUrlsList) {
  const fileContents = [];

  for (const rawUrl of rawUrlsList) {
    try {
      const content = await getRawFileContent(rawUrl);
      fileContents.push(content);
    } catch (error) {
      console.error(error.message);
    }
  }

  return fileContents;
}

async function screenshotUrl(url) {
  const apiKey = process.env.SCREENSHOTLAYER_KEY;
  const apiUrl = new URL(SCREENSHOTLAYER_API_URL);

  apiUrl.searchParams.append("access_key", apiKey);
  apiUrl.searchParams.append("url", url);
  apiUrl.searchParams.append("delay", SCREENSHOTLAYER_DELAY);
  apiUrl.searchParams.append("force", SCREENSHOTLAYER_FORCE);

  try {
    const response = await axios.get(apiUrl, { responseType: "arraybuffer" });
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(
        `Failed to fetch the screenshot. Status code: ${response.status}`,
      );
    }
  } catch (error) {
    throw new Error(`Error fetching the screenshot: ${error.message}`);
  }
}

async function uploadImageToImgbb(image) {
  const apiKey = process.env.IMGBB_KEY;
  const apiUrl = new URL(IMGBB_API_URL);
  apiUrl.searchParams.append("key", apiKey);

  const formData = new FormData();
  formData.append("image", image);

  try {
    const response = await axios.post(apiUrl, formData);

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(
        `Failed to upload image. Status code: ${response.status}`,
      );
    }
  } catch (error) {
    throw new Error(`Error uploading image: ${error.message}`);
  }
}

module.exports = {
  getRawFileContent,
  getAllFilesContent,
  screenshotUrl,
  uploadImageToImgbb,
};
