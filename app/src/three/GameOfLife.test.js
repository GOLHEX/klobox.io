import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import GOL from './GameOfLife';

let container = null;

beforeEach(() => {
  // Set up a DOM element as a render target
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  // Clean up on exiting
  unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('GOL', () => {
  it('renders without crashing', () => {
    act(() => {
      render(<GOL />, container);
    });
    expect(container.textContent).toBe('');
  });

  it('initializes the scene, camera, and renderer correctly', () => {
    act(() => {
      render(<GOL />, container);
    });

    const golInstance = container.firstChild;
    expect(golInstance.state.scene).toBeDefined();
    expect(golInstance.camera).toBeDefined();
    expect(golInstance.state.renderer).toBeDefined();
  });

  it('updates the screen size correctly', () => {
    act(() => {
      render(<GOL />, container);
    });

    const golInstance = container.firstChild;
    const initialScreenWidth = golInstance.state.clientWidth;
    const initialScreenHeight = golInstance.state.clientHeight;

    act(() => {
      golInstance.updateScreenSize();
    });

    expect(golInstance.state.clientWidth).not.toBe(initialScreenWidth);
    expect(golInstance.state.clientHeight).not.toBe(initialScreenHeight);
  });

  // Add more tests for other methods and functionalities
});