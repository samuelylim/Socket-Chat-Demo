$(function() {
  const FADE_TIME = 150; // ms
  const TYPING_TIMER_LENGTH = 400; // ms
  const COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  const $window = $(window);
  const $usernameInput = $('.usernameInput'); // Input for username
  const $messages = $('.messages');           // Messages area
  const $inputMessage = $('.inputMessage');   // Input message input box

  const $loginPage = $('.login.page');        // The login page
  const $chatPage = $('.chat.page');          // The chatroom page

  const socket = io();

  // Prompt for setting a username
  let username;
  let loggedIn;
  let color;
  let connected = false;
  let typing = false;
  let lastTypingTime;
  let $currentInput = $usernameInput.focus();
  let password;
  // Sets the client's username
  const setUsername = () => {
    if(username === undefined){
          username = $usernameInput.val().trim();
    } else{
      password = $usernameInput.val();
    }
    if(localStorage.getItem('timestamp') > Date.now()){
      socket.emit("test","this is a test");
    }
    if (username != undefined || username.length <= 15 && /^[a-zA-Z0-9_!@#$%&]*$/gm.test(username)) {
      // Tell the server your username
      socket.emit('add user', username, password,(response) => {
        if (response.succeeded === true) {
          loggedIn = true;
          $loginPage.fadeOut();
          $chatPage.show();
          $loginPage.off('click');
          $currentInput = $inputMessage.focus();
          color = response.color;
        } else {
          $usernameInput.val('');
          $usernameInput.prop({type:"password"})
          $(".title").text("Enter password or reload the page");
        }
      });
    } else {
      username = false;
      $(".title").text("Please choose a different username")
    }

  }

  // Sends a chat message
  const sendMessage = () => {
    let message = $inputMessage.val();
    // Prevent markup from being injected into the message
    // if there is a non-empty message and a socket connection

    if (message && connected) {
      
      $inputMessage.val('');
      addChatMessage({ username, message, color });
      // tell server to execute 'new message' and send along one parameter
      socket.emit('new message', message, (response) => eval(response));

    }


  }

  // Log a message
  const log = (message, options) => {
    const $el = $('<li>').addClass('log').text(message);
    addMessageElement($el, options);
  }

  // Adds the visual chat message to the message list
  const addChatMessage = (data, options = {}) => {
    // Don't fade the message in if there is an 'X was typing'
    const $typingMessages = getTypingMessages(data);
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }


    const $usernameDiv = $('<span class="username"/>')
      .text(data.username)
      .css('color', data.color);


    const $messageBodyDiv = $('<span class="messageBody">')
      .text(data.message);
    if (options.command) {
      $messageBodyDiv.css('color', '#808080').css('font-style', "italic")
    }

    const typingClass = data.typing ? 'typing' : '';
    const $messageDiv = $('<li class="message"/>')
      .data('username', data.username)
      .addClass(typingClass)
      .append($usernameDiv, $messageBodyDiv);

    addMessageElement($messageDiv, options);
  }

  // Adds the visual chat typing message
  const addChatTyping = (data) => {
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  }

  // Removes the visual chat typing message
  const removeChatTyping = (data) => {
    getTypingMessages(data).fadeOut(function() {
      $(this).remove();
    });
  }

  // Adds a message element to the messages and scrolls to the bottom
  // el - The element to add as a message
  // options.fade - If the element should fade-in (default = true)
  // options.prepend - If the element should prepend
  //   all other messages (default = false)
  const addMessageElement = (el, options) => {
    const $el = $(el);
    // Setup default options
    if (!options) {
      options = {};
    }
    if (typeof options.fade === 'undefined') {
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined') {
      options.prepend = false;
    }

    // Apply options
    if (options.fade) {
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }
if($messages.innerHeight() + $messages.scrollTop() >= $messages[0].scrollHeight -100){
  $messages[0].scrollTop = $messages[0].scrollHeight;

}
    
  }

  // Prevents input from having injected markup
  const cleanInput = (input) => {
    return input.replace(/\\/g, "\\\\")
  }

  // Updates the typing event
  const updateTyping = () => {
    if (connected) {
      if (!typing) {
        typing = true;
        socket.emit('typing');
        
      }
      lastTypingTime = (new Date()).getTime();

      setTimeout(() => {
        const typingTimer = (new Date()).getTime();
        const timeDiff = typingTimer - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
          socket.emit('stop typing');
          
          typing = false;
        }
      }, TYPING_TIMER_LENGTH);
    }
  }

  // Gets the 'X is typing' messages of a user
  const getTypingMessages = (data) => {
    return $('.typing.message').filter(function(i) {
      return $(this).data('username') === data.username;
    });
  }

  // Keyboard events

  $window.keydown(event => {
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      if (loggedIn) {
        sendMessage();
        socket.emit('stop typing');
      
        typing = false;
      } else {
        setUsername();
      }
    }
  });

  $inputMessage.on('input', () => {
    updateTyping();
  });

  // Click events

  // Focus input when clicking anywhere on login page
  $loginPage.click(() => {
    $currentInput.focus();
  });

  // Focus input when clicking on the message input's border
  $inputMessage.click(() => {
    $inputMessage.focus();
  });

  // Socket events

  // Whenever the server emits 'login', log the login message
  socket.on('login', (data) => {
    connected = true;
    // Display the welcome message
    const message = 'Welcome to Kellov\'s cool chat room – Type /help for commands';
    log(message, {
      prepend: true
    });
  });

  // Whenever the server emits 'new message', update the chat body
  socket.on('new message', (data) => {
    addChatMessage(data);
  });

  socket.on("command return", (data) => {
    data.forEach((line) => {
      addChatMessage({ username: "", message: line }, { command: true });
    })
  })

  socket.on("ban", (data) => {
    localStorage.setItem('timestamp', data);
    document.cookie = "timestamp=" + data + ";Secure";
  })
  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', (data) => {
    log(`${data.username} joined`);
  });

  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', (data) => {
    log(`${data.username} left`);
    removeChatTyping(data);
  });

  // Whenever the server emits 'typing', show the typing message
  socket.on('typing', (data) => {
    addChatTyping(data);
  });

  // Whenever the server emits 'stop typing', kill the typing message
  socket.on('stop typing', (data) => {
    removeChatTyping(data);
  });

  socket.on('disconnect', () => {
    log('you have been disconnected');
  });

  socket.on('reconnect', () => {
    log('you have been reconnected');
    if (username) {
      socket.emit('add user', username);
    }
  });

  socket.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
  });

});