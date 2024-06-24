const { ipcRenderer } = require('electron');

// Listen for the motor type sent from the main process
ipcRenderer.on('motor-type', (event, motorType) => {
  document.querySelectorAll('.motor-type-display').forEach(element => {
    element.textContent = `Motor Type: ${motorType}`;
  });
});

// Event listener for the process calculate button
document.querySelectorAll('.process-calculate-button').forEach(button => {
  button.addEventListener('click', async (event) => {
    const calculator = event.target.closest('.calculator');
    const motorType = document.querySelector('.motor-type-display').textContent.split(': ')[1];
    const imagePath = await ipcRenderer.invoke('select-image');
    if (imagePath) {
      calculator.querySelector('.filepath').textContent = `Selected file: ${imagePath}`;
      const imagePreview = calculator.querySelector('.image-preview');
      imagePreview.src = imagePath;
      imagePreview.style.display = 'block';

      const loadingMessage = calculator.querySelector('.loading-message');
      const output = calculator.querySelector('.output');

      loadingMessage.style.display = 'block';
      output.textContent = '';

      const result = await ipcRenderer.invoke('processAndCalculate', imagePath, motorType);

      loadingMessage.style.display = 'none';
      output.textContent = result;
    }
  });
});

// Event listener for the back button
document.querySelector('.back-button').addEventListener('click', () => {
  ipcRenderer.send('go-back-to-main-menu');
});
