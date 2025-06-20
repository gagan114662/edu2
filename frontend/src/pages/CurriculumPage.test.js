import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import axios from 'axios';
import CurriculumPage from './CurriculumPage';
// HomePage is not directly tested here but used as a navigation target.
// Its dependencies (like AuthContext) should be mocked if it renders fully.

jest.mock('axios'); // Mock axios module

// Mock CurriculumNode to simplify testing CurriculumPage logic
// This mock will allow us to control the onSelect callback directly.
const mockOnSelect = jest.fn();
jest.mock('../components/CurriculumNode', () => ({ label, data, path, onSelect }) => (
  <div data-testid={`node-${label.replace(/\s+/g, '-')}`}>
    <span>{label}</span>
    {/* Simulate a button for each type of item that could be passed to onSelect */}
    {data && data.description && data.keywords && /* It's a standard */ (
      <button onClick={() => onSelect({ id: label, type: 'standard', description: data.description, keywords: data.keywords, path: `${path}/${label}` })}>
        Select Standard {label}
      </button>
    )}
    {data && !data.description && typeof data === 'object' && Object.keys(data).length > 0 && /* It's a topic-like node */ (
      <button onClick={() => onSelect({ id: label, type: 'topic', path: `${path}/${label}`, data })}>
         Select Topic {label}
      </button>
    )}
  </div>
));

// Minimal mock for HomePage for navigation testing
const MockHomePage = () => {
    const location = useLocation();
    // Store location state for assertion if needed, or check directly in test
    global.navigatedState = location.state;
    return <div>HomePage Loaded</div>;
};


const sampleCurriculumData = {
  "Math": {
    "Grade 5": {
      "Common Core": {
        "Fractions": {
          "NF.A.1": { "description": "Add fractions.", "keywords": ["fractions", "addition"] }
        },
        "Geometry": { "G.A.1": { "description": "Graph points.", "keywords": ["graph", "points"] } }
      }
    }
  },
  "Science": {
    "Grade 5": {
      "NGSS": {
        "Ecosystems": {
          "LS2-1": { "description": "Ecosystem dynamics.", "keywords": ["ecosystem", "dynamics"] }
        }
      }
    }
  }
};

describe('CurriculumPage', () => {
  beforeEach(() => {
    axios.get.mockReset();
    mockOnSelect.mockClear(); // Clear if CurriculumNode's onSelect is directly used by test
    global.navigatedState = null; // Reset navigation state capture
  });

  test('fetches and displays curriculum data', async () => {
    axios.get.mockResolvedValueOnce({ data: sampleCurriculumData });
    render(<MemoryRouter><CurriculumPage /></MemoryRouter>);

    expect(screen.getByText(/Loading curriculum.../i)).toBeInTheDocument();
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith('http://localhost:8000/api/curriculum'));

    expect(await screen.findByText('Math')).toBeInTheDocument();
    expect(screen.getByText('Science')).toBeInTheDocument();
    expect(screen.getByTestId('node-Math')).toBeInTheDocument();
    expect(screen.getByTestId('node-Science')).toBeInTheDocument();
  });

  test('displays error message on fetch failure', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<MemoryRouter><CurriculumPage /></MemoryRouter>);

    expect(await screen.findByText(/Error: Network Error/i)).toBeInTheDocument();
  });

  test('handles selection of a standard and navigates with state', async () => {
    axios.get.mockResolvedValueOnce({ data: sampleCurriculumData });

    render(
      <MemoryRouter initialEntries={['/curriculum']}>
        <Routes>
          <Route path="/curriculum" element={<CurriculumPage />} />
          <Route path="/" element={<MockHomePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Math'); // Wait for data

    // Simulate clicking on the "Select Standard NF.A.1" button
    const selectStandardButton = screen.getByRole('button', { name: /Select Standard NF.A.1/i });
    fireEvent.click(selectStandardButton);

    // Check if selected item is displayed on CurriculumPage
    expect(await screen.findByText(/Currently Selected Focus:/i)).toBeInTheDocument();
    expect(screen.getByText(/Standard: NF.A.1/i)).toBeInTheDocument();
    expect(screen.getByText('Add fractions.')).toBeInTheDocument(); // Description

    // Click the "Practice This Standard" button
    const practiceButton = screen.getByRole('button', { name: /Practice this Standard/i });
    fireEvent.click(practiceButton);

    // Check if navigation occurred to HomePage and state was passed
    await waitFor(() => {
         expect(screen.getByText('HomePage Loaded')).toBeInTheDocument();
    });

    expect(global.navigatedState).toEqual({
      selectedStandardId: 'NF.A.1',
      selectedStandardDescription: 'Add fractions.'
    });
  });

  test('handles selection of a topic and navigates with state', async () => {
    axios.get.mockResolvedValueOnce({ data: sampleCurriculumData });

    render(
      <MemoryRouter initialEntries={['/curriculum']}>
        <Routes>
          <Route path="/curriculum" element={<CurriculumPage />} />
          <Route path="/" element={<MockHomePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Math'); // Wait for data to load

    // Simulate clicking on "Select Topic Fractions"
    // The mock CurriculumNode creates a button "Select Topic Fractions"
    const selectTopicButton = screen.getByRole('button', { name: /Select Topic Fractions/i });
    fireEvent.click(selectTopicButton);

    expect(await screen.findByText(/Currently Selected Focus:/i)).toBeInTheDocument();
    expect(screen.getByText(/Topic: Fractions/i)).toBeInTheDocument();

    const discussTopicButton = screen.getByRole('button', { name: /Discuss this Topic/i });
    fireEvent.click(discussTopicButton);

    await waitFor(() => {
        expect(screen.getByText('HomePage Loaded')).toBeInTheDocument();
    });

    // Check the state passed during navigation for a topic
    expect(global.navigatedState).toEqual(expect.objectContaining({
      selectedTopicName: 'Fractions',
      // selectedTopicDescription might be a default one like "Focusing on topic: Fractions"
      // or actual description if topic itself had one. The mock provides `description: "Topic: Fractions"`
      // The actual CurriculumNode logic for onSelect for topics was:
      // onSelect({ id: label, type: 'topic', path: `${path}/${label}`, data })
      // The CurriculumPage handlePracticeSelectedItem then sets:
      // navigationState.selectedTopicDescription = selectedItem.description || `Focusing on topic: ${selectedItem.id}`;
      // Our current mock of CurriculumNode for a topic passes: { path: `/path/to/${label}`, description: `Topic: ${label}`, ...data }
      // So, selectedItem.description would be `Topic: Fractions`
      selectedTopicDescription: 'Topic: Fractions'
    }));
  });

});
```
