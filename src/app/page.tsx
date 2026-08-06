export default function Home() {
  interface Tile {
    x: number;
    y: number;
    key: string;
  }

  const x = 30;
  const y = 24;

  const tiles: any = {
    Board_1SQuare: {
      path: 'assets/board/Board_1Square.svg',
      space: {
        x: 1,
        y: 1,
      },
      usedSpace: [0, 0],
    },
  };

  const tileMap = new Map<string, Tile>();
  const matrix: string[][] = Array.from({ length: y }, () => Array.from({ length: x }, () => ''));

  return <main className={'h-screen w-screen overflow-x-scroll overflow-y-auto'}></main>;
}
