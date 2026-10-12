import { BottomSheet, MobileScroll, useMobileDevice } from "./mobile";
import { VeilApp } from "./veil/VeilApp";
import "./veil/fonts";

export default function Prototype() {
  const { device } = useMobileDevice();
  return <VeilApp Scroll={MobileScroll} Sheet={BottomSheet} safeAreaTop={device.geometry.safeArea.top} />;
}
