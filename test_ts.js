const { exec } = require('child_process');
exec(`tailscale status --json`, (statusErr, stdout) => {
    let domain = '';
    if (!statusErr && stdout) {
        try {
            const statusObj = JSON.parse(stdout);
            if (statusObj.Self && statusObj.Self.DNSName) {
                domain = statusObj.Self.DNSName.replace(/\.$/, '');
            }
        } catch(e){
            console.error(e);
        }
    }
    console.log("Domain is:", domain);
});
