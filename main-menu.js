const { ipcRenderer } = require('electron');

document.querySelector('.next-button').addEventListener('click', () => {
  const motorType = document.querySelector('.motor-type').value;
  ipcRenderer.send('open-image-processing-window', motorType);
});
