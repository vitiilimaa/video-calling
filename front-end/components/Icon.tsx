import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

type Props = {
  iconName: string;
  backgroundColor: string;
  style?: any;
};

export default function IconBox(props: Props) {
  return (
    <View
      style={[
        {backgroundColor: props.backgroundColor},
        props.style,
        styles.button,
      ]}>
      <Icon name={props.iconName} color="white" size={18} />
      <Text style={styles.textStyle}>O participante desabilitou o microfone</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 'auto',
    paddingVertical: 15,
    paddingHorizontal: 25,
    elevation: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 100,
  },
  textStyle: {
    marginTop: 5,
    color: '#fff',
  },
});
