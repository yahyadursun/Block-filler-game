import MainMenu from './components/MainMenu';
import LevelSelect from './components/LevelSelect';
import GameView from './components/GameView';
import ParkourLevelSelect from './components/ParkourLevelSelect';
import ParkourMode from './components/ParkourMode';
import { useGameStore } from './store/useGameStore';
import './App.css';

function App() {
  const { currentView } = useGameStore();

  return (
    <div className="App">
      {currentView === 'MENU' && <MainMenu />}
      {currentView === 'LEVEL_SELECT' && <LevelSelect />}
      {currentView === 'GAME' && <GameView />}
      {currentView === 'PARKOUR_SELECT' && <ParkourLevelSelect />}
      {currentView === 'PARKOUR' && <ParkourMode />}
    </div>
  );
}

export default App;
