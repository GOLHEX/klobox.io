self.onmessage = function(e) {
    const cellsMap = e.data;
    const newCellsMap = calculateNewState(cellsMap);
    postMessage(newCellsMap);
  };
  
  function calculateNewState(cellsMap) {
    // Логика вычисления нового состояния
    // ...
  
    return newCellsMap;
  }
  