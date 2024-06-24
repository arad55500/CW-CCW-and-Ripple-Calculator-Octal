const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const vision = require('@google-cloud/vision');

let motorType = null;
let mainWindow;
let imageProcessingWindow;

// Replace 'YOUR_API_KEY' with your actual API key
const apiKey = 'AIzaSyCjFo93J0lfYrH8WYZkXqJhyhUKIC1lNrk';

function createMainMenu() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'main-menu.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
}

function createImageProcessingWindow() {
  imageProcessingWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      nodeIntegration: true,
      contextIsolation: false,
      resizeable: false
    },
  });

  imageProcessingWindow.loadFile('image-processing.html');
  imageProcessingWindow.webContents.on('did-finish-load', () => {
    imageProcessingWindow.webContents.send('motor-type', motorType);
  });

  imageProcessingWindow.on('closed', () => {
    imageProcessingWindow = null;
  });

  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
}

ipcMain.on('open-image-processing-window', (event, selectedMotorType) => {
  motorType = selectedMotorType;
  createImageProcessingWindow();
});

ipcMain.on('go-back-to-main-menu', () => {
  if (imageProcessingWindow) {
    imageProcessingWindow.close();
    createMainMenu();
  }
});

// Remove the default menu
Menu.setApplicationMenu(null);

app.whenReady().then(createMainMenu);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainMenu();
  }
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  return result.filePaths[0];
});

// Function to convert image to black and white
async function convertImageToBlackAndWhite(imagePath) {
  const image = await Jimp.read(imagePath);
  const bwImagePath = 'bw-' + path.basename(imagePath);
  await image.greyscale().writeAsync(bwImagePath);
  return bwImagePath;
}

// Combined process and calculate function
ipcMain.handle('processAndCalculate', async (event, imagePath, motorType) => {
  return new Promise(async (resolve, reject) => {
    try {
      const processedImagePath = await convertImageToBlackAndWhite(imagePath);

      // Use Google Cloud Vision for OCR with API key
      const client = new vision.ImageAnnotatorClient({
        keyFilename: path.join(__dirname, 'genial-aspect-418216-42edfb06859f.json'), // Replace with your service account key file path
      });

      const [result] = await client.textDetection({
        image: { source: { filename: processedImagePath } },
        key: apiKey,
      });
      
      const detections = result.textAnnotations;
      const text = detections.map(detection => detection.description).join('\n');

      const formattedText = formatText(text);
      fs.writeFileSync('formatted_output.txt', formattedText);

      const values = formattedText.match(/-?\d+\.\d+\w+|-?\d+\w+/g);

      // Extract the first 3 numbers that end with 'ms' for uPeaks
      const uPeaks = values.filter(v => v.endsWith('ms')).slice(0, 3).map(v => {
        const cleaned = v.replace(/[^-\d\.]+/g, '');
        return Math.abs(parseFloat(cleaned));
      });

      // Extract the first 3 numbers that end with 'V' for cycleTimes
      const cycleTimes = values.filter(v => v.endsWith('V')).slice(0, 3).map(v => {
        const cleaned = v.replace(/[^-\d\.]+/g, '');
        return Math.abs(parseFloat(cleaned));
      });

      // Extract the next 2 numbers that end with 'V' for ripple calculation
      const rippleValues = values.filter(v => v.endsWith('V')).slice(3, 5).map(v => {
        const cleaned = v.replace(/[^-\d\.]+/g, '');
        return Math.abs(parseFloat(cleaned));
      });

      if (uPeaks.length < 3 || cycleTimes.length < 3 || rippleValues.length < 2) {
        console.error("Not enough values for uPeaks, cycleTimes, or rippleValues.");
        reject('Not enough values for uPeaks, cycleTimes, or rippleValues.');
        return;
      }

      let KEValues;
      if (motorType === 'Ramon') {
        KEValues = uPeaks.map((uPeak, index) => 
          (uPeak / 2 * 11 * cycleTimes[index] * Math.pow(10, -3)) / (2 * Math.PI)
        );
      } else {
        KEValues = uPeaks.map((uPeak, index) => 
          (uPeak / 2 * 8 * cycleTimes[index] * Math.pow(10, -3)) / (2 * Math.PI)
        );
      }
      const KEAverage = KEValues.reduce((acc, val) => acc + val, 0) / KEValues.length;

      const larger = Math.max(...rippleValues);
      const smaller = Math.min(...rippleValues);

      const BMEFRipple = ((larger - smaller) / (larger + smaller)) * 100;

      const resultText = `KE 3 phase average: ${KEAverage.toFixed(3)}\nBMEF Ripple: ${BMEFRipple.toFixed(2)}%`;
      fs.writeFileSync('calculation_results.txt', resultText);
      resolve(resultText);
    } catch (error) {
      console.error('Error during image processing or calculation:', error);
      reject('Error during image processing or calculation.');
    }
  });
});

// Your existing formatText function
function formatText(rawText) {
  const matches = rawText.match(/-?\d+\.\d+\s*m?[sV]|-?\d+\.\d+\s*V|-?\d+\.\d+V/g) || [];

  // Filter out numbers that start with '0.', '4.0V', and those with only one decimal point
  const filteredMatches = matches.filter(match => {
    // Extract the numerical part of the match
    const num = match.match(/-?\d+\.\d+/);
    // Check if the number starts with '0.', is '4.0V', or has only one decimal point
    return num && !num[0].startsWith('0.') && match !== '4.0V' && !/^\d+\.\d$/.test(num[0]);
  });

  // Remove duplicates
  const uniqueMatches = Array.from(new Set(filteredMatches.map(match => match.trim())));

  const formattedNumbers = uniqueMatches.map(match => match.trim());

  let formattedString = formattedNumbers.join(' ');
  formattedString = formattedString.replace(/\s{2,}/g, ' '); // Remove extra spaces
  formattedString = formattedString.replace(/\s+(ms|mV)/g, '$1'); // Adjust spacing around ms and mV
  formattedString = formattedString.replace(/\s+V/g, 'V'); // Remove unnecessary spaces before 'V'

  console.log(formattedString);
  return formattedString;
}
