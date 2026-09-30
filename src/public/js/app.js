// Entry point: loads the components and handles deletes, which touch both lists

import "./components/fc-feed.js";
import "./components/fc-composer.js";
import "./components/fc-my-messages.js";

const feed = document.querySelector("fc-feed");
const myMessages = document.querySelector("fc-my-messages");

document.addEventListener("fc-posted", () => myMessages?.load());

document.addEventListener("fc-delete", async (event) => {
  const { rkey } = event.detail;
  const card = event.target;

  const response = await fetch(`/api/message/${encodeURIComponent(rkey)}`, {
    method: "DELETE",
  }).catch(() => null);

  if (!response?.ok) {
    card.deleteFailed();
    return;
  }

  myMessages?.remove(rkey);
  feed?.remove(card.message.id);
});

// Show a login error from the OAuth redirect once, then clean up the URL
if (new URLSearchParams(location.search).has("login_error")) {
  history.replaceState(null, "", location.pathname);
}
