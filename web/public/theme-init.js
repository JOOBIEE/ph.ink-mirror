(function () {
  try {
    var saved = localStorage.getItem('ph-theme')
    var theme =
      saved === 'dark' || saved === 'light'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    document.documentElement.setAttribute('data-theme', theme)
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light')
  }
})()