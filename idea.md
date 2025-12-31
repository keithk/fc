A project that I typically build as an example of a new language / framework / etc is "face chat" - pretty simple. an ephermal chat interface that lets users give hte browser permission to use their webcam. it takes a 5 second video and turns it into a gif. you can write up to 255 characters and attach the gif and hit send. you can only send one chat per minute. you can see responses, but only the last 20 (and if you refresh the page they're gone)

the big difference this time? i want to use bluesky! i want to use the bluesky SDK to:
1. use oauth for authentication
2. the option to post your gif/chat to your bluesky feed/pdf
3. we should save all gifs/chats the user has made and have a page they can see them - this should use our own lexicon for atproto. if the user deletes them, we delete it from their pds.

technology choices:
- bun: use for everything - websockets, fs, server, sqlite (look at bun documentation as needed)