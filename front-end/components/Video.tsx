import {Image, ImageSourcePropType, StyleSheet, View} from 'react-native';
import {MediaStream, RTCView} from 'react-native-webrtc';
import Button from './Button';
import IconBox from './Icon';

type Props = {
  toggleVideo?: () => void;
  toggleAudio?: () => void;
  hangup: () => void;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  activeVideoLocalStream: boolean;
  activeAudioLocalStream: boolean;
  activeVideoRemoteStream?: boolean;
  activeAudioRemoteStream?: boolean;
  photoLocalStream?: ImageSourcePropType | string;
  photoRemoteStream?: ImageSourcePropType | string;
};

function ButtonContainer(props: Props) {
  return (
    <View style={styles.bContainer}>
      <Button
        iconName={props.activeVideoLocalStream ? 'video' : 'video-slash'}
        backgroundColor="grey"
        onPress={props.toggleVideo}
      />
      <Button
        iconName={
          props.activeAudioLocalStream ? 'microphone' : 'microphone-slash'
        }
        backgroundColor="grey"
        onPress={props.toggleAudio}
      />
      <Button iconName="phone" backgroundColor="red" onPress={props.hangup} />
    </View>
  );
}

export default function Video(props: Props) {
  if (props.localStream && !props.remoteStream) {
    return (
      <View style={styles.container}>
        {props.activeVideoLocalStream ? (
          <RTCView
            streamURL={props.localStream.toURL()}
            objectFit="cover"
            style={styles.video}
          />
        ) : (
          <Image
            source={props.photoLocalStream as ImageSourcePropType}
            style={styles.video}
          />
        )}
        <ButtonContainer
          activeVideoLocalStream={props.activeVideoLocalStream}
          activeAudioLocalStream={props.activeAudioLocalStream}
          toggleVideo={props.toggleVideo}
          toggleAudio={props.toggleAudio}
          hangup={props.hangup}
        />
      </View>
    );
  }

  if (props.localStream && props.remoteStream) {
    return (
      <View style={styles.container}>
        {props.activeVideoRemoteStream ? (
          <RTCView
            streamURL={props.remoteStream?.toURL() ?? ''}
            objectFit="cover"
            style={styles.video}
            zOrder={4}
          />
        ) : (
          <Image
            source={props.photoRemoteStream as ImageSourcePropType}
            style={styles.video}
          />
        )}

        <View style={styles.containerVideoLocal}>
          {props.activeVideoLocalStream ? (
            <RTCView
              streamURL={props.localStream?.toURL() ?? ''}
              objectFit="cover"
              style={styles.videoLocal}
              zOrder={1}
            />
          ) : (
            <Image
              source={props.photoLocalStream as ImageSourcePropType}
              style={styles.videoLocal}
            />
          )}
          {!props.activeAudioLocalStream && (
            <IconBox
              iconName={'microphone-slash'}
              backgroundColor="grey"
              style={styles.iconMuteVideoLocal}
            />
          )}
        </View>

        <ButtonContainer
          activeVideoLocalStream={props.activeVideoLocalStream}
          activeAudioLocalStream={props.activeAudioLocalStream}
          toggleVideo={props.toggleVideo}
          toggleAudio={props.toggleAudio}
          hangup={props.hangup}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  bContainer: {
    flexDirection: 'row',
    bottom: 30,
    columnGap: 5,
  },
  container: {
    position: 'relative',
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    elevation: 9,
  },
  video: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  containerVideoLocal: {
    backgroundColor: '#000',
    position: 'absolute',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    width: 100,
    height: 150,
    top: 0,
    left: 20,
    elevation: 10,
  },
  videoLocal: {
    position: 'absolute',
    backgroundColor: '#000',
    width: '100%',
    height: '100%',
  },
  imageLocal: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  iconMuteVideoLocal: {
    marginBottom: 5,
    marginRight: 5,
  },
});
