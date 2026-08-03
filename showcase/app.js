document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copy-btn');
  const codeSnippet = document.getElementById('code-snippet');

  if (copyBtn && codeSnippet) {
    copyBtn.addEventListener('click', () => {
      // Get the text, ignoring comment lines if needed, or copying full
      const textToCopy = codeSnippet.textContent.trim();
      
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          // Success feedback
          const icon = copyBtn.querySelector('i');
          if (icon) {
            icon.className = 'fa-solid fa-check text-green-400';
            setTimeout(() => {
              icon.className = 'fa-solid fa-copy text-[10px]';
            }, 2000);
          }
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
        });
    });
  }
});
