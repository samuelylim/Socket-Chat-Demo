
var cookie = require('cookie');
const Database = require("@replit/database")
const db = new Database()
const crypto = require('crypto');
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: ["https://admin.socket.io"],
    credentials: true
  }
});
const { instrument } = require("@socket.io/admin-ui");
const port = 3000;
const https = require('https');

instrument(io, {
  auth: {
    type: "basic",
    username: "admin",
    password: process.env.HASH // "changeit" encrypted with bcrypt
  },
});

const client = require('socket.io-client');

var proxy = client.connect('https://socketio-chat-h9jt.herokuapp.com/', { secure: true, rejectUnauthorized: false });
var onevent = proxy.onevent;
proxy.onevent = function(packet) {
  var args = packet.data || [];
  onevent.call(this, packet);    // original call
  packet.data = ["*"].concat(args);
  onevent.call(this, packet);      // additional call to catch-all
};

proxy.on('connect', function() {
  try {
    console.log('socket connect');
    proxy.emit("add user", "Proxy");
  } catch (e) {
    console.log(e);
  }
});

proxy.io.on("error", (error) => {
  console.log(error)
});

const features = [
  "Optional anti-faking accounts",
  "Anti-spam protection",
  "Private messaging",
  "Custom username colors",
  "Custom themes",
  "Offline messaging",
  "Participating in this chat at the same time",
  "Slash commands",
  "Accurate online list"
]
proxy.on("new message", (data) => {
  if (data.message.toLowerCase().startsWith("/proxy")) {
    proxy.emit("new message", "Too many issues in this chat?");
    proxy.emit("new message", "Use Kellov's cool chat! It has:");
    var list = features.slice(0);
    function listFeatures() {
      let randInt = Math.floor(Math.random() * (list.length - 1));
      proxy.emit("new message", list[randInt]);
      if (list.length - 1 > features.length - 5 && list.length != 0) {
        list.splice(randInt, 1);
        listFeatures();

      } else {
        proxy.emit("new message", "And more!");
        proxy.emit("new message", "");
        proxy.emit("new message", "Join at https://socket-chat-demo.kellofkindles.repl.co/");
      }

    }
    listFeatures(features);

  }
})

proxy.on("*", function(event, data) {
  if (!event.includes("typing")) {
    console.log(event, data)
  }
  if (event === "user joined") {
    io.to("proxyRoom").emit("command return", [data.username + " joined the proxy chat", `There are now ${data.numUsers} users online`])
  } else if (event === "user left") {
    io.to("proxyRoom").emit("command return", [data.username + " left the proxy chat", `There are now ${data.numUsers} users online`])
  } else {
    io.to("proxyRoom").emit(event, data);

  }
});


const COLORS = [
  '#e21400', '#91580f', '#f8a700', '#f78b00',
  '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
  '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
];

function genUsernameColor(username) {
  let hash = 7;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + (hash << 5) - hash;
  }
  // Calculate color
  const index = Math.abs(hash % COLORS.length);
  return COLORS[index];
}

const prefix = "/";
const commands = {
  "help": {
    "run": help,
    "description": 'Provides information on how to use commands',
    "usage": prefix + "help {command}",
    "require": 0
  },
  "ping": {
    "run": ping,
    "description": "Pings the bot",
    "usage": prefix + "ping",
    "require": 0
  },
  "coin": {
    "run": coin,
    "description": "Flips a coin",
    "usage": prefix + "coin",
    "require": 0
  },
  "color": {
    "run": color,
    "description": "Allows you to change the color of your username",
    "usage": prefix + "color {color}",
    "require": 1
  },
  "w": {
    "run": whisper,
    "description": "Allows you to private message someone [BETA]",
    "usage": prefix + 'w {username OR "username"} {message}',
    "require": 0
  },
  "r": {
    "run": reply,
    "description": "Replies to the last private message [BETA]",
    "usage": prefix + 'r {message}',
    "require": 0
  },
  "online": {
    "run": online,
    "description": "Allows you to see who's online",
    "usage": prefix + "online",
    "require": 0
  },
  "ban": {
    "run": ban,
    "description": "Bans a user for an hour",
    "usage": prefix + "ban {username}",
    "require": 5
  },
  "eval": {
    "run": run,
    "description": "Runs some code",
    "usage": prefix + "eval {code}",
    "require": 10
  },
  "account": {
    "run": account,
    "description": "Create or manage your account",
    "usage": prefix + "account {create} {password} | account {manage}",
    "require": 0
  },
  "mail": {
    "run": mail,
    "description": "Send a message to an offline user",
    "usage": prefix + "mail {username} {message}",
    "require": 1
  },
  "joke": {
    "run": joke,
    "description": "Tells you a joke",
    "usage": prefix + "joke",
    "require": 0
  },
  "kick": {
    "run": kick,
    "description": "Disconnects a user",
    "usage": prefix + "kick {user}",
    "require": 3
  },
  "proxy": {
    "run": proxySettings,
    "description": "Change proxy settings",
    "usage": prefix + "proxy {setting}",
    "require": 1
  },
  "p": {
    "run": sendProxy,
    "description": "Send a message to the other chat",
    "usage": prefix + "p {message}",
    "require": 1
  },
  "theme": {
    "run": theme,
    "description": "Change the color of your chat",
    "usage": prefix + "theme {background | input | outline} {color}",
    "require": 1
  }
}
const commandKeys = Object.keys(commands);

// Edit database entry without having to  replace entire entry
function editAccount(account, object) {
  return new Promise((resolve, reject) => {
    db.get(account).then(data => {
      for (const [key, value] of Object.entries(object)) {
        data[key] = value;
        db.set(account, data).then(() => {
          resolve(data);
        });
      }
    })
  })
}

function theme(data, socket, callback) {
  let args = data.substring(7).split(" ");
  let className = "";



  switch (args[0].toLowerCase()) {
    case "background":
      callback(`document.getElementsByClassName("chat page")[0].style.backgroundColor = "${args[1]}"`);

      break;

    case "input":
      callback(`document.getElementsByClassName("inputMessage")[0].style.backgroundColor = "${args[1]}"`);
      break;

    case "outline":
      callback(`document.getElementsByClassName("inputMessage")[0].style.borderColor = "${args[1]}"`);
      break;

    default:
      socket.emit("command return", ["Make sure you include either background, input, or outline and a color"]);
      return;
  }
  socket.emit("command return", ["Updated theme!"])
}

function proxySettings(data, socket, callback) {
  socket.emit("command return", ["This command is still in beta"])
  let args = data.substring(7).toLowerCase().split(" ");
  switch (args[0]) {
    case "on":
      socket.proxying = true;
      socket.join("proxyRoom");
      socket.emit("command return", ["Connected to the proxy"]);
      break;

    case "off":
      socket.proxying = false;
      socket.leave("proxyRoom");
      socket.emit("command return", ["Disconnected from the proxy"])
      break;

    default:
      socket.emit("command return", ["Proxying is currently " + socket.proxying ? "on" : "off"])
  }
}


function sendProxy(data, socket, callback) {
  if (socket.proxying) {
    proxy.emit("new message", `${socket.username}: ${data.substring(3)}`);
    io.to("proxyRoom").emit("new message", {
      username: socket.username,
      color: "black",
      message: data.substring(3)
    })
  } else {
    socket.emit("command return", ["Enable proxying to use this command", "(/proxy on)"])
  }
}


function mail(data, socket, callback) {
  var user = data.substring(6).match(/((?:"[^"]*")|\w*)/)[0]
  if (!activeAccounts[user.toLowerCase()]) {
    db.get(user.toLowerCase()).then(account => {
      if (account != null) {
        if (!account.mail) {
          account.mail = {};
        }
        if (account.mail[socket.username.toLowerCase()]) {
          socket.emit("command return", ["Replaced old message: ", account.mail[socket.username.toLowerCase()]])
        } else {
          socket.emit("command return", ["Sent new message to " + user])
        }
        account.mail[socket.username.toLowerCase()] = data.substring(6 + user.length);
        db.set(user.toLowerCase(), account);

      } else {
        socket.emit("command return", ["Could not find that user"])
      }
    })
  } else {
    socket.emit("command return", ["That user is already online!", `Try using ${prefix}w instead`])
  }
}

function joke(data, socket, callback) {
  const options = {
    hostname: 'v2.jokeapi.dev',
    port: 443,
    path: '/joke/Pun,Misc?safe-mode',
    method: 'GET'
  }

  const req = https.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);
    let output = "";
    res.on('data', d => {
      output += d;
    })

    res.on('end', () => {
      let joke = JSON.parse(output);
      switch (joke.type) {
        case "twopart":
          socket.emit("command return", [joke.setup]);
          setTimeout(() => { socket.emit("command return", [joke.delivery]) }, joke.setup.length * 20);
          break;
        case "single":
          socket.emit("command return", [joke.joke]);
          break;
      }
    })
  })

  req.on('error', error => {
    console.error(error)
  })

  req.end()

}

function account(data, socket, callback) {
  args = data.substring(9).split(" ");
  db.get(socket.username.toLowerCase()).then((account) => {
    if (account != null) {
      console.log(account);
      socket.emit("command return", ["Yes account", args])

    } else {
      if (args[0].toLowerCase() == "create" && args[1] != undefined) {
        if (args[1].length >= 4) {
          socket.emit("command return", ["Creating account with password '" + args[1], "'You can change this password by typing " + prefix + "account manage password {new password} "])
          const salt = crypto.randomBytes(5).toString("hex")
          socket.emit("command return", [crypto.createHash('sha256').update(args[1] + salt).digest('hex') + " " + salt])
          db.set(socket.username.toLowerCase(), { "password": crypto.createHash('sha256').update(args[1] + salt).digest('hex') + " " + salt, "created": Date.now() }).then(() => {
            console.log("Account created: " + socket.username.toLowerCase())
          });

          socket.level = 1;
        } else {
          socket.emit("command return", ["Password must be at least four characters long"])
        }

      } else {
        socket.emit("command return", ["No account!", "Create an account by typing " + prefix + "account create {password}"])
      }
    }
  })
}

function run(data, socket, callback) {
  try {
    let output = Function(`"use strict";return(function(activeAccounts,socket,db){return ${data.substring(6)}})`)()(activeAccounts, socket, db, crypto, editAccount) // Creates a new function with access to the variables activeAccounts, socket, and db that evaluates the code from the /eval command

    socket.emit("command return", ["" + output]) // Converts the output of the previously declared function to a string and sends it back the the client
  } catch (error) {
    socket.emit("command return", [error.name, error.message])
  }
}

function kick(data, socket, callback) {
  let toKick = data.substring(6);
  if (activeAccounts[toKick] && activeAccounts[toKick].socket.level < socket.level) {
    activeAccounts[toKick].socket.disconnect();
    socket.emit("command return", ["Disconnected " + toKick]);
    io.to("liveAudit").emit("command return", [socket.username + " disconnected " + toKick]);
  } else {
    socket.emit("command return", ["You do not have permission to disconnect " + toKick])
  }
}

function ban(data, socket, callback) {
  let args = data.trim().substring(5).toLowerCase().split(" ");
  let timestamp = (args[1] === undefined) ? Date.now() + 300000 : Date.now() + args[1];

  if (activeAccounts[args[0]] && activeAccounts[args[0]].socket.level < socket.level) {
    activeAccounts[args[0]].socket.emit("ban", timestamp)
    activeAccounts[args[0]].socket.disconnect()
    socket.emit("command return", ["User sent kick message and disconnected"])
  } else {
    socket.emit("command return", ["You do not have permission to ban " + args[0]])
  }
}

function online(data, socket, callback) {
  socket.emit("command return", Object.keys(activeAccounts))
}

function whisper(data, socket, callback) {
  var user = data.substring(3).match(/((?:"[^"]*")|\w*)/)[0]
  if (activeAccounts[user.toLowerCase()]) {
    activeAccounts[user.toLowerCase()].socket.emit("command return", ["Message from " + socket.username, data.substring(3 + user.length)]);

    socket.emit("command return", ["Message sent"])
    activeAccounts[user.toLowerCase()].socket.lastWhisper = socket
  } else {
    socket.emit("command return", ["Could not find that user."])
  }
}

function reply(data, socket, callback) {
  if (socket.lastWhisper != null) {
    socket.lastWhisper.emit("command return", ["Reply from " + socket.username, data.substring(3)]);
    socket.emit("command return", ["Reply sent"]);
    socket.lastWhisper.lastWhisper = socket
  } else {
    socket.emit("command return", ["No one to reply to"]);
  }
}

function help(data, socket) {
  var message = [];
  option = data.substring(6).trim().toLowerCase();

  if (option.length <= 0) {
    commandKeys.forEach((command) => {
      if (socket.level >= commands[command].require) {
        message.push("");
        message.push(command + ": " + commands[command].description);
        message.push("  Usage: " + commands[command].usage);
      }

    })
  } else if (commands[option]) {
    message.push("");
    message.push(option + ": " + commands[option].description);
    message.push("  Usage: " + commands[option].usage);
  }
  socket.emit("command return", message);

}

function ping(data, socket) {
  socket.emit("command return", ["Pong!"]);
}

function coin(data, socket) {
  socket.emit("command return", [(Math.floor(Math.random() * 2) == 0) ? 'Heads' : 'Tails'])
}

function color(data, socket, callback) {
  color = data.substring(7);
  socket.color = color;
  console.log(color)
  callback("color = '" + color + "'")
  if (socket.level > 0) {
    editAccount(socket.username.toLowerCase(), { "color": color })
  }
  socket.emit("command return", ["Changed your color to " + color]);
}

var activeAccounts = {};
var ipRateLimit = [];
var accountRateLimit = [];

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom

let numUsers = 0;

io.on('connection', (socket) => {
  let addedUser = false;
  socket.on("test", (data) => {
    console.log(data)
  })
  // when the client emits 'new message', this listens and executes
  socket.on('new message', (data, callback) => {
    if (typeof data !== "string") {
      console.log(socket.username + " didn't sent a string");
      return;
    }
    if (socket.username === undefined || activeAccounts[socket.username.toLowerCase()] === undefined) {
      socket.emit("command return", ["Unknown user, please reload the page"])
    } else {
      if (activeAccounts[socket.username.toLowerCase()].ratelimit.length > 6) {
        socket.emit("command return", ["You are sending messages too fast"]);
      } else {
        activeAccounts[socket.username.toLowerCase()].ratelimit.push(Date.now());
        if (data.length <= 300) {
          if (data.charAt(0) === prefix) {
            // Run commands
            var cmd = data.substring(1).split(" ")[0].toLowerCase();
            if (commands[cmd] && commands[cmd].require <= socket.level) {
              commands[cmd].run(data, socket, callback);
            } else {
              socket.emit("command return", ["You do not have permission to use this command"]);
            }
          } else {
            socket.broadcast.emit('new message', {
              username: socket.username,
              color: socket.color,
              message: data
            });
          }
        }
      }
    }

    var time = Date.now();
    var i = 0;
    if (socket.username != undefined && activeAccounts[socket.username.toLowerCase()] != undefined) {
      while (time - activeAccounts[socket.username.toLowerCase()].ratelimit[i] > 10000) {
        activeAccounts[socket.username.toLowerCase()].ratelimit.shift();
      }
    }

  });


  // when the client emits 'add user', this listens and executes
  socket.on('add admin', (username, callback) => {
    if (username === process.env['admin']) {
      if (activeAccounts["person"]) {
        activeAccounts["person"].socket.emit("command return", ["You have been disconnected by an admin."])
        activeAccounts["person"].socket.disconnect();
      }

      console.log("ADMIN HAS JOINED");
      activeAccounts["person"] = { "ratelimit": [], "socket": socket };
      socket.username = "Person";
      socket.level = 10;
      socket.color = genUsernameColor("Person");
      callback({ succeeded: true, color: socket.color });
      ++numUsers;
      addedUser = true;
      socket.emit('login', { numUsers: numUsers });

    } else {
      callback(false);
    }
  })

  socket.on('add user', (username, password, callback) => {
    if (addedUser) return;
    callback = (callback === undefined) ? console.log : callback
    // we store the username in the socket session for this client
    cookies = (socket.request.headers.cookie) ? socket.request.headers.cookie : ""
    if (cookie.parse(cookies).timestamp > Date.now()) {
      console.log("User kicked, ignoring");
      return;
    }
    if (username.length > 1 && username.length <= 15 && /^[a-zA-Z0-9_!@#$%&]*$/gm.test(username) && !activeAccounts[username.toLowerCase()]) {
      socket.username = username;
      socket.level = 0;
      socket.color = genUsernameColor(username);

      db.get(username.toLowerCase()).then(value => {

        if (value != null) {
          let hash = value.password.split(" ");
          if (password === null || crypto.createHash('sha256').update(password + hash[1]).digest('hex') !== hash[0]) {
            callback(false);
            return;
          } else {
            socket.level = value.level || 1;
            socket.color = value.color || socket.color;
            if (socket.level >= 5) {
              socket.join("liveAudit");
            }
            if (value.mail) {
              for (const sender in value.mail) {
                socket.emit("command return", ["New message from " + sender, value.mail[sender], ""])

              }
              editAccount(socket.username.toLowerCase(), { mail: {} });
            }

          }

        }
        console.log(username + " has joined")
        activeAccounts[username.toLowerCase()] = { "ratelimit": [], "socket": socket };

        callback({ succeeded: true, color: socket.color });
        ++numUsers;
        addedUser = true;
        socket.emit('login', { numUsers: numUsers });

        socket.broadcast.emit('user joined', {
          username: socket.username,
          numUsers: numUsers
        });
      })


    } else {
      callback(false)
    }

  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username,
      color: socket.color
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      --numUsers;
      console.log(socket.username + " has left")
      delete activeAccounts[socket.username.toLowerCase()];
      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
});


setTimeout(() => {
  console.log("test")
}, 3000)