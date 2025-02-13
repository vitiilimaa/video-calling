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
import {IP_ADDRESS, ONESIGNAL_APP_ID, MY_USER_ID} from '@env';
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
import OtherImg from './img/Caller3.jpg';
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
  const [userJoined, setUserJoined] = useState<UsersJoined>({
    username: '',
    oneSignalSubscriptionId: '',
    photo: '',
  });
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
  const [callAcceptedByNotification, setCallAcceptedByNotification] =
    useState(false);
  const peerConnection = useRef<RTCPeerConnection>();

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
    try {
      await setupWebrtc();

      if (peerConnection.current && socket) {
        const personWhoWillCall = userJoined.username;
        const personWhoWillBeCalled = Object.keys(users || {}).find(
          key => key !== userJoined.username,
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

  const join = async (offlineObj?: {
    from: string;
    to: string;
    offer: RTCSessionDescription;
  }) => {
    try {
      if (socket) {
        if (!call.to && !offlineObj?.to) {
          const deviceId = await DeviceInfo.getUniqueId();
          const mockUsername = `user_${deviceId.substring(0, 8)}`;
          socket.emit('get-offer', {from: mockUsername});
          return;
        }

        await setupWebrtc();

        if (peerConnection.current) {
          if ('onicecandidate' in peerConnection.current) {
            peerConnection.current.onicecandidate = (
              event: RTCIceCandidateEvent<'icecandidate'>,
            ) => {
              if (event.candidate) {
                const currentUser = userJoined.username
                  ? userJoined.username
                  : offlineObj?.to;
                const sendTo =
                  Object.keys(users || {}).find(
                    key => key !== userJoined.username,
                  ) !== 'username' ??
                  Object.keys(users || {}).find(
                    key => key !== userJoined.username,
                  ) !== undefined
                    ? Object.keys(users || {}).find(
                        key => key !== userJoined.username,
                      )
                    : offlineObj?.from;
                socket.emit('answerCandidates', {
                  candidate: event.candidate.toJSON(),
                  from: currentUser || '',
                  to: sendTo || '',
                });
              }
            };
          }

          const offerDescription = call.offer ? call.offer : offlineObj?.offer;
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

          const from = call.from ? call.from : offlineObj?.from;
          const to = call.to ? call.to : offlineObj?.to;

          socket.emit('answer', {
            from,
            to,
            answer,
          });

          socket.emit('offerIcecandidate', {
            from,
            to,
          });
        }
      }

      setGettingCall(false);
      setCallAcceptedByNotification(false);
      OneSignal.Notifications.clearAll();
    } catch (err) {
      console.error('error join:', err);
    }
  };

  // Para desconectar da chamada, libera a stream e deleta o documento da chamada
  const hangup = async () => {
    const deviceId = await DeviceInfo.getUniqueId();
    const mockUsername = `user_${deviceId.substring(0, 8)}`;

    const from = mockUsername;
    if (socket) socket.emit('hangup-call', {from});
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
        const sendTo = Object.keys(users || {}).find(
          key => key !== userJoined.username,
        );
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
        const sendTo = Object.keys(users || {}).find(
          key => key !== userJoined.username,
        );
        socket.emit('toggleAudio', {isActive: audioTrack.enabled, to: sendTo});
      }
    }
  };

  useEffect(() => {
    const newSocket = io(`http://${IP_ADDRESS}:9000`);
    setSocket(newSocket);

    const generateMockUsername = async () => {
      const deviceId = await DeviceInfo.getUniqueId();
      const subscriptionId = await OneSignal.User.pushSubscription.getIdAsync();

      const mockUsername = `user_${deviceId.substring(0, 8)}`;
      setUserJoined(prevState => ({
        ...prevState,
        username: mockUsername,
        oneSignalSubscriptionId: subscriptionId || '',
        photo: mockUsername === MY_USER_ID ? YourImg : OtherImg,
      }));
      newSocket.emit('user-joined', {
        username: mockUsername,
        oneSignalSubscriptionId: subscriptionId,
        photo: mockUsername === MY_USER_ID ? YourImg : OtherImg,
      });
    };

    generateMockUsername();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socket) {
      const handleUsers = async (allUsers: UsersJoined) => {
        console.log({allUsers});
        setUsers(allUsers);

        if (callAcceptedByNotification) {
          await join();
        }
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

      const handleOfferOffline = async ({from, to, offer}: OfferPayload) => {
        setCall(prevState => ({
          ...prevState,
          from,
          to,
          offer,
        }));

        const offlineUserObj = {
          from,
          to,
          offer,
        };

        await join(offlineUserObj);
      };

      const handleAnswer = async ({answer}: AnswerPayload) => {
        try {
          if (peerConnection.current) {
            setCall(prevState => ({...prevState, answer}));
            const answerDescription = new RTCSessionDescription(answer);
            await peerConnection.current.setRemoteDescription(
              answerDescription,
            );

            const personWhoWillCall = userJoined.username;
            const personWhoWillBeCalled = Object.keys(users || {}).find(
              key => key !== userJoined.username,
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
          if (peerConnection && peerConnection.current && candidates) {
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

      const handleHasOffer = (hasOffer: boolean) => {
        if (hasOffer) setGettingCall(true);
      };

      socket.on('get-users', handleUsers);
      socket.on('offer', handleOffer);
      socket.on('get-offer', handleOfferOffline);
      socket.on('answer', handleAnswer);
      socket.on('icecandidate', handleIceCandidate);
      socket.on('call-ended', handleCallEnded);
      socket.on('toggleVideo', handleToggleVideo);
      socket.on('toggleAudio', handleToggleAudio);
      socket.on('has-offer', handleHasOffer);

      return () => {
        socket.off('get-users', handleUsers);
        socket.off('offer', handleOffer);
        socket.off('answer', handleAnswer);
        socket.off('get-offer', handleOfferOffline);
        socket.off('icecandidate', handleIceCandidate);
        socket.off('call-ended', handleCallEnded);
        socket.off('toggleVideo', handleToggleVideo);
        socket.off('toggleAudio', handleToggleAudio);
        socket.off('hasOffer', handleHasOffer);
      };
    }
  }, [socket, userJoined, callAcceptedByNotification]);

  useEffect(() => {
    const onOpen = async (event: NotificationClickEvent) => {
      const action = event.result.actionId;
      if (action === 'accept-call') {
        if (socket) await join();
        else setCallAcceptedByNotification(true);
      } else if (action === 'refuse-call') {
        await hangup();
      } else console.log('Você abriu o app');
    };

    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);
    OneSignal.Notifications.addEventListener('click', onOpen);
    return () => OneSignal.Notifications.removeEventListener('click', onOpen);
  }, [socket, call]);

  useEffect(() => {
    if (socket && userJoined.username) {
      socket.emit('has-offer', {username: userJoined.username});
    }
  }, [socket, userJoined]);

  if (gettingCall) {
    const sendTo = Object.keys(users || {}).find(
      key => key !== userJoined.username,
    );

    return (
      <GettingCall photo={users[sendTo].photo} hangup={hangup} join={join} />
    );
  }

  // Exibe o localStream ligando
  // Exibe tanto o local quanto o remoto uma vez que acontece a conexão
  if (localStream) {
    const currentUser = userJoined.username;
    const sendTo =
      Object.keys(users || {}).find(key => key !== userJoined.username) ?? '';

    return (
      <Video
        toggleVideo={toggleVideo}
        toggleAudio={toggleAudio}
        hangup={hangup}
        localStream={localStream}
        activeVideoLocalStream={activeVideoLocalStream}
        activeAudioLocalStream={activeAudioLocalStream}
        photoLocalStream={users[currentUser]?.photo}
        remoteStream={remoteStream}
        activeVideoRemoteStream={activeVideoRemoteStream}
        activeAudioRemoteStream={activeAudioRemoteStream}
        photoRemoteStream={users[sendTo]?.photo}
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
