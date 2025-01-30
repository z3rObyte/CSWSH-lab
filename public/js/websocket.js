const socket = new WebSocket('wss://localhost:3000');

socket.addEventListener('open', () => {
  console.log('WebSocket connection established');
});

socket.addEventListener('message', (event) => {
  const response = JSON.parse(event.data);

  if (response.success) {
    alert(response.message);
    location.reload(); 
  } else {
    alert(`Error: ${response.message}`);
  }
});

socket.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
});

socket.addEventListener('close', () => {
  console.log('WebSocket connection closed');
});

document.getElementById('transferForm').onsubmit = (e) => {
  e.preventDefault();

  const receiver = document.getElementById('receiver').value;
  const amount = parseFloat(document.getElementById('amount').value);

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ receiver, amount }));
  } else {
    alert('WebSocket connection is not open');
  }
};