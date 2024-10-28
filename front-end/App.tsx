import {useState, useRef, useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Video from './components/Video';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import GettingCall from './components/GettingCall';
import Button from './components/Button';
import io, {Socket} from 'socket.io-client';
import {IP_ADDRESS, ONESIGNAL_APP_ID} from '@env';
import DeviceInfo from 'react-native-device-info';
import {LogLevel, OneSignal} from 'react-native-onesignal';

const config = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
};

type GettingCallProps = {
  from: string;
  to: string;
  offer: RTCSessionDescription | null;
  answer: RTCSessionDescription | null;
};

function App() {
  const [localStream, setLocalStream] = useState<MediaStream | null>();
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>();
  const [gettingCall, setGettingCall] = useState(false);
  const [username, setUsername] = useState('');
  const [oneSignalSubscriptionId, setOneSignalSubscriptionId] = useState();
  const [call, setCall] = useState<GettingCallProps>({
    from: '',
    to: '',
    offer: null,
    answer: null,
  });
  const [users, setUsers] = useState();
  const [socket, setSocket] = useState<Socket>();
  const peerConnection = useRef<RTCPeerConnection>();

  // Conecta ao servidor e seta um nome para o usuário que abriu o aplicativo
  useEffect(() => {
    const newSocket = io(`http://${IP_ADDRESS}:9000`);
    setSocket(newSocket);

    const generateMockUsername = async () => {
      const deviceId = await DeviceInfo.getUniqueId();
      const subscriptionId = await OneSignal.User.pushSubscription.getIdAsync();

      const mockUsername = `user_${deviceId.substring(0, 8)}`;
      setUsername(mockUsername);
      setOneSignalSubscriptionId(subscriptionId);
    };

    generateMockUsername();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socket && username && oneSignalSubscriptionId) {
      const userJoinedObj = {
        username,
        oneSignalSubscriptionId,
      };
      socket.emit('user-joined', userJoinedObj);

      const handleUsers = allUsers => {
        console.log({allUsers});
        setUsers(allUsers);
      };

      const handleOffer = async ({from, to, offer}) => {
        setCall(prevState => ({
          ...prevState,
          from,
          to,
          offer,
        }));
        setGettingCall(true);
        // await displayNotifications();
      };

      const handleAnswer = async ({answer}) => {
        if (peerConnection.current) {
          setCall(prevState => ({...prevState, answer}));
          await peerConnection.current.setRemoteDescription(answer);
        }
      };

      const handleIceCandidate = async candidate => {
        if (peerConnection.current)
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate),
          );
      };

      const handleCallEnded = () => {
        if (peerConnection.current) {
          peerConnection.current.close();
          peerConnection.current = null;
        }
        streamCleanUp();
        setGettingCall(false);
        OneSignal.Notifications.clearAll();
      };

      socket.on('get-users', handleUsers);
      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('icecandidate', handleIceCandidate);
      socket.on('call-ended', handleCallEnded);

      return () => {
        socket.off('get-users', handleUsers);
        socket.off('offer', handleOffer);
        socket.off('answer', handleAnswer);
        socket.off('icecandidate', handleIceCandidate);
        socket.off('call-ended', handleCallEnded);
      };
    }
  }, [socket, username, oneSignalSubscriptionId]);

  useEffect(() => {
    const onOpen = async event => {
      const action = event.result.actionId;
      if (action === 'accept-call') await join();
      else if (action === 'refuse-call') await hangup();
      else console.log('Você abriu o app');
    };

    OneSignal.Debug.setLogLevel(LogLevel.Verbose);
    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);
    OneSignal.Notifications.addEventListener('click', onOpen);
    return () => OneSignal.Notifications.removeEventListener('click', onOpen);
  }, []);

  // Configura uma conexão WebRTC para estabelecer uma chamada de vídeo entre dois peers (usuários)
  const setupWebrtc = async () => {
    // Esse objeto é responsável pela comunicação ponto a ponto entre dois dispositivos
    // Ele gerencia o fluxo de dados (como áudio e vídeo) entre os peers
    peerConnection.current = new RTCPeerConnection(config);

    // Solicita acesso ao áudio e vídeo do dispositivo
    // Pega o stream de áudio e vídeo para a chamada
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: {
        frameRate: 30,
        facingMode: 'front',
      },
    });

    if (stream) {
      // O vídeo e o áudio local são disponibilizados para serem transmitidos assim que as tracks
      // do stream forem adicionadas à peerConnection
      stream
        .getTracks()
        .forEach(
          track =>
            peerConnection.current &&
            peerConnection.current.addTrack(track, stream),
        );
      setLocalStream(stream);
    }

    // Define um listener que será acionado quando um stream for recebido do peer remoto
    // Quando isso acontecer, remoteStream é setado, exibindo o vídeo do outro participante da chamada
    peerConnection.current.ontrack = event => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    if (socket)
      peerConnection.current.onicecandidate = event => {
        if (event.candidate) {
          socket.emit('icecandidate', event.candidate);
        }
      };
  };

  const create = async () => {
    await setupWebrtc();

    if (peerConnection.current && socket) {
      // Cria uma offer para a chamada
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      const personWhoWillCall = username;
      const personWhoWillBeCalled = Object.keys(users).find(
        key => key !== username,
      );

      setCall(prevState => ({
        ...prevState,
        from: personWhoWillCall || '',
        to: personWhoWillBeCalled || '',
        offer: peerConnection.current.localDescription ?? null,
      }));
      socket.emit('offer', {
        from: personWhoWillCall,
        to: personWhoWillBeCalled,
        offer: peerConnection.current.localDescription,
      });
    }
  };

  const join = async () => {
    await setupWebrtc();
    if (peerConnection.current && socket && call.offer) {
      await peerConnection.current.setRemoteDescription(call.offer);
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      setCall(prevState => ({
        ...prevState,
        answer: peerConnection.current.localDescription,
      }));
      socket.emit('answer', {
        from: call.from,
        to: call.to,
        answer: peerConnection.current.localDescription,
      });
    }

    setGettingCall(false);
  };

  // Para desconectar da chamada, libera a stream e deleta o documento da chamada
  const hangup = async () => {
    if (socket) socket.emit('hangup-call', {from: call.from, to: call.to});
  };

  const streamCleanUp = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream.release();
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      remoteStream.release();
    }
    setLocalStream(null);
    setRemoteStream(null);
  };

  if (gettingCall) {
    return <GettingCall hangup={hangup} join={join} />;
  }

  // Exibe o localStream ligando
  // Exibe tanto o local quanto o remoto uma vez que acontece a conexão
  if (localStream) {
    return (
      <Video
        hangup={hangup}
        localStream={localStream}
        remoteStream={remoteStream}
      />
    );
  }

  // Exibe o botão de ligação
  return (
    <View style={styles.container}>
      <Button iconName={'video'} backgroundColor="grey" onPress={create} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
