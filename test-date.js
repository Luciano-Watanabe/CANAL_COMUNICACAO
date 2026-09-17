fetch('http://localhost:3001/api/chat/todas-conversas')
  .then(r => r.json())
  .then(d => {
    const lmt = d.conversas[0]?.ultimaMensagem;
    console.log("lmt:", lmt, "type:", typeof lmt);
    try {
      console.log(new Date(lmt).toLocaleTimeString());
    } catch (e) {
      console.log("ERROR:", e);
    }
  })
  .catch(console.error);
