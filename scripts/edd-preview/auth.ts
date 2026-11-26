export let station = 'kolarovo';
export function setStation(value: string) {
  station = value;
}
export function useDisAuth() {
  return {
    canOperateStation: true,
    profile: { userId: station, name: station === 'kolarovo' ? 'Novák' : 'Kováč' },
  };
}
