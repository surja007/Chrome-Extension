document.getElementById('generateIcons').addEventListener('click', generateIcons);

function generateIcons() {
  const sizes = [16, 48, 128];
  
  sizes.forEach(size => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#0077b5');
    gradient.addColorStop(1, '#00a0dc');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = size * 0.02;
    ctx.strokeRect(0, 0, size, size);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.45}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JP', size/2, size/2);
    
    // Download
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `icon${size}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });
  
  alert('Icons generated! Check your downloads folder.');
}
