import MainMenu from './components/MainMenu';
import LevelSelect from './components/LevelSelect';
import GameView from './components/GameView';
import { useGameStore } from './store/useGameStore';
import './App.css';

function App() {
  const { currentView } = useGameStore();

  return (
    <div className="App">
      {currentView === 'MENU' && <MainMenu />}
      {currentView === 'LEVEL_SELECT' && <LevelSelect />}
      {currentView === 'GAME' && <GameView />}
    </div>
  );
}

export default App;
