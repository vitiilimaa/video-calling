import {useState, useRef, useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Video from './components/Video';
import {
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import GettingCall from './components/GettingCall';
import Button from './components/Button';
import io, {Socket} from 'socket.io-client';
import {IP_ADDRESS, ONESIGNAL_APP_ID} from '@env';
import DeviceInfo from 'react-native-device-info';
import {NotificationClickEvent, OneSignal} from 'react-native-onesignal';
import {UsersJoined} from './types/User';
import {
  AnswerPayload,
  IceCandidatePayload,
  OfferPayload,
} from './types/payload';
import RTCTrackEvent from 'react-native-webrtc/lib/typescript/RTCTrackEvent';
import RTCIceCandidateEvent from 'react-native-webrtc/lib/typescript/RTCIceCandidateEvent';
import YourImg from './img/Caller.jpg';
import OtherImg from './img/Caller2.jpg';
import {Alert} from 'react-native';

const config = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302'],
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
  const [oneSignalSubscriptionId, setOneSignalSubscriptionId] = useState<
    string | null
  >(null);
  const [call, setCall] = useState<GettingCallProps>({
    from: '',
    to: '',
    offer: null,
    answer: null,
  });
  const [users, setUsers] = useState<UsersJoined>({
    username: '',
    oneSignalSubscriptionId: '',
    photo: '',
  });
  const [socket, setSocket] = useState<Socket>();
  const [activeVideoLocalStream, setActiveVideoLocalStream] = useState(true);
  const [activeAudioLocalStream, setActiveAudioLocalStream] = useState(true);
  const [activeVideoRemoteStream, setActiveVideoRemoteStream] = useState(true);
  const [activeAudioRemoteStream, setActiveAudioRemoteStream] = useState(true);
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
      const userJoinedObj: UsersJoined = {
        username,
        oneSignalSubscriptionId,
        // colocar seu username mockado
        photo: username === 'user_id' ? YourImg : OtherImg,
      };
      socket.emit('user-joined', userJoinedObj);

      const handleUsers = (allUsers: UsersJoined) => {
        console.log({allUsers});
        setUsers(allUsers);
      };

      const handleOffer = async ({from, to, offer}: OfferPayload) => {
        setCall(prevState => ({
          ...prevState,
          from,
          to,
          offer,
        }));
        setGettingCall(true);
      };

      const handleAnswer = async ({answer}: AnswerPayload) => {
        try {
          if (peerConnection.current) {
            setCall(prevState => ({...prevState, answer}));
            const answerDescription = new RTCSessionDescription(answer);
            await peerConnection.current.setRemoteDescription(
              answerDescription,
            );

            const personWhoWillCall = username;
            const personWhoWillBeCalled = Object.keys(users || {}).find(
              key => key !== username,
            );

            socket.emit('answerIcecandidate', {
              from: personWhoWillCall,
              to: personWhoWillBeCalled,
              answer: peerConnection.current.localDescription,
            });
          }
        } catch (err) {
          console.error('error handleAnswer:', err);
        }
      };

      const handleIceCandidate = async ({candidates}: IceCandidatePayload) => {
        try {
          if (peerConnection.current) {
            for (const candidate of candidates) {
              await peerConnection.current
                .addIceCandidate(candidate)
                .catch(error =>
                  console.error('Error adding ICE candidate:', error),
                );
            }
          }
        } catch (err) {
          console.error('error handleIceCandidate:', err);
        }
      };

      const handleCallEnded = () => {
        if (peerConnection.current) {
          peerConnection.current.close();
          peerConnection.current = undefined;
        }
        streamCleanUp();
        setGettingCall(false);
        OneSignal.Notifications.clearAll();
        setActiveVideoLocalStream(true);
        setActiveAudioLocalStream(true);
        setActiveVideoRemoteStream(true);
        setActiveAudioRemoteStream(true);
      };

      const handleToggleVideo = (isActive: boolean) => {
        setActiveVideoRemoteStream(isActive);
      };

      const handleToggleAudio = (isActive: boolean) => {
        setActiveAudioRemoteStream(isActive);
      };

      socket.on('get-users', handleUsers);
      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('icecandidate', handleIceCandidate);
      socket.on('call-ended', handleCallEnded);
      socket.on('toggleVideo', handleToggleVideo);
      socket.on('toggleAudio', handleToggleAudio);

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
    const onOpen = async (event: NotificationClickEvent) => {
      const action = event.result.actionId;
      if (action === 'accept-call') {
        await join();
      } else if (action === 'refuse-call') {
        await hangup();
        if (peerConnection.current) {
          peerConnection.current.close();
          peerConnection.current = undefined;
        }
        streamCleanUp();
        setGettingCall(false);
      } else console.log('Você abriu o app');
    };

    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);
    OneSignal.Notifications.addEventListener('click', onOpen);
    return () => OneSignal.Notifications.removeEventListener('click', onOpen);
  }, [socket, call]);

  // Configura uma conexão WebRTC para estabelecer uma chamada de vídeo entre dois peers (usuários)
  const setupWebrtc = async () => {
    try {
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
      if ('ontrack' in peerConnection.current) {
        peerConnection.current.ontrack = (event: RTCTrackEvent<'track'>) => {
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
          }
        };
      }
    } catch (err) {
      console.error('error setupWebrtc:', err);
    }
  };

  const create = async () => {
    if (Object.keys(users || {}).length !== 2) {
      return Alert.alert(
        'Alerta',
        'É necessário que pelo menos tenha o cadastro de 2 pessoas no aplicativo.',
      );
    }

    try {
      await setupWebrtc();

      if (peerConnection.current && socket) {
        const personWhoWillCall = username;
        const personWhoWillBeCalled = Object.keys(users || {}).find(
          key => key !== username,
        );

        if ('onicecandidate' in peerConnection.current) {
          peerConnection.current.onicecandidate = (
            event: RTCIceCandidateEvent<'icecandidate'>,
          ) => {
            if (event.candidate) {
              socket.emit('offerCandidates', {
                candidate: event.candidate.toJSON(),
                from: personWhoWillCall || '',
                to: personWhoWillBeCalled || '',
              });
            }
          };
        }

        // Cria uma offer para a chamada
        const offerOptions = {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        };
        const offerDescription = await peerConnection.current.createOffer(
          offerOptions,
        );
        await peerConnection.current.setLocalDescription(offerDescription);

        const offer = {
          type: offerDescription.type,
          sdp: offerDescription.sdp,
        } as RTCSessionDescription;

        setCall(prevState => ({
          ...prevState,
          from: personWhoWillCall || '',
          to: personWhoWillBeCalled || '',
          offer,
        }));
        socket.emit('offer', {
          from: personWhoWillCall,
          to: personWhoWillBeCalled,
          offer,
        });
      }
    } catch (err) {
      console.error('error create:', err);
    }
  };

  const join = async () => {
    await setupWebrtc();
    try {
      if (peerConnection.current && socket && call.offer) {
        if ('onicecandidate' in peerConnection.current) {
          peerConnection.current.onicecandidate = (
            event: RTCIceCandidateEvent<'icecandidate'>,
          ) => {
            if (event.candidate) {
              const currentUser = username;
              const sendTo = Object.keys(users || {}).find(
                key => key !== username,
              );
              socket.emit('answerCandidates', {
                candidate: event.candidate.toJSON(),
                from: currentUser || '',
                to: sendTo || '',
              });
            }
          };
        }

        const offerDescription = call.offer;
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(offerDescription),
        );

        const answerDescription = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answerDescription);

        const answer = {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        } as RTCSessionDescription;

        setCall(prevState => ({
          ...prevState,
          answer,
        }));

        socket.emit('answer', {
          from: call.from,
          to: call.to,
          answer,
        });

        socket.emit('offerIcecandidate', {
          from: call.from,
          to: call.to,
        });
      }

      setGettingCall(false);
      OneSignal.Notifications.clearAll();
    } catch (err) {
      console.error('error join:', err);
    }
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

  const toggleVideo = () => {
    if (localStream && socket) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setActiveVideoLocalStream(videoTrack.enabled);

      if (call.to) {
        const sendTo = Object.keys(users || {}).find(key => key !== username);
        socket.emit('toggleVideo', {isActive: videoTrack.enabled, to: sendTo});
      }
    }
  };

  const toggleAudio = () => {
    if (localStream && socket) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setActiveAudioLocalStream(audioTrack.enabled);
      if (call.to) {
        const sendTo = Object.keys(users || {}).find(key => key !== username);
        socket.emit('toggleAudio', {isActive: audioTrack.enabled, to: sendTo});
      }
    }
  };

  if (gettingCall) {
    const sendTo = Object.keys(users || {}).find(key => key !== username);

    return (
      <GettingCall
        photo={username !== sendTo ? YourImg : OtherImg}
        hangup={hangup}
        join={join}
      />
    );
  }

  // Exibe o localStream ligando
  // Exibe tanto o local quanto o remoto uma vez que acontece a conexão
  if (localStream) {
    const currentUser = username;
    const sendTo = Object.keys(users || {}).find(key => key !== username);

    return (
      <Video
        toggleVideo={toggleVideo}
        toggleAudio={toggleAudio}
        hangup={hangup}
        localStream={localStream}
        activeVideoLocalStream={activeVideoLocalStream}
        activeAudioLocalStream={activeAudioLocalStream}
        photoLocalStream={users[currentUser as keyof UsersJoined].photo}
        remoteStream={remoteStream}
        activeVideoRemoteStream={activeVideoRemoteStream}
        activeAudioRemoteStream={activeAudioRemoteStream}
        photoRemoteStream={users[sendTo as keyof UsersJoined].photo}
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
