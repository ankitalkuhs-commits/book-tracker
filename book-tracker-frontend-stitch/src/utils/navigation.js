// React Router's BrowserRouter stores the in-app history position in history.state.idx.
// idx 0 (or no state) means this tab opened directly on the page — navigate(-1) would leave the site.
export function goBackOrHome(navigate) {
  if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
  else navigate('/', { replace: true })
}
