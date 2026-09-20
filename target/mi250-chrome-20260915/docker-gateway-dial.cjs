// Container-loopback dial for the Windows-owned gateway. Bytes stay unchanged.
const net = require('node:net');
const server = net.createServer(client => {
  const upstream = net.connect(42010, 'host.docker.internal');
  client.pipe(upstream); upstream.pipe(client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
});
server.listen(42010, '127.0.0.1', () => console.log('Studio gateway TCP dial ready'));
