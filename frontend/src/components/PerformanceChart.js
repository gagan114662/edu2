import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const PerformanceChart = ({ trendData }) => {
  if (!trendData || trendData.length === 0) {
    return <p>No performance trend data available to display.</p>;
  }

  const chartData = {
    labels: trendData.map(dataPoint => dataPoint.date), // E.g., "YYYY-MM-DD" or week
    datasets: [
      {
        label: 'Performance Metric (e.g., Hours Spent / Score)', // Adjust label as needed
        data: trendData.map(dataPoint => dataPoint.value),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Performance Over Time', // Or a more specific title
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        // You might want to add a title for the Y-axis here
        // title: {
        //   display: true,
        //   text: 'Value (e.g. Hours / Score)'
        // }
      },
      // x: {
      //   title: {
      //     display: true,
      //     text: 'Date / Week'
      //   }
      // }
    },
  };

  return <Line options={options} data={chartData} />;
};

export default PerformanceChart;
