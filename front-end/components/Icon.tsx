import {View, StyleSheet} from 'react-native';
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
      <Icon name={props.iconName} color="white" size={10} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '20%',
    height: 'auto',
    padding: 4,
    elevation: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 100,
  },
});
