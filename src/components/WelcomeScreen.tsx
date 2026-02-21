import React, { useState, useEffect } from 'react';

interface WelcomeScreenProps {
    onStart: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
    const [visible, setVisible] = useState(true);
    const [animateOut, setAnimateOut] = useState(false);

    const handleStart = () => {
        setAnimateOut(true);
        setTimeout(() => {
            setVisible(false);
            onStart();
        }, 800); // Check CSS transition time
    };

    if (!visible) return null;

    return (
        <div
            className="welcome-screen"
            style={{
                transform: animateOut ? 'translateY(-100%)' : 'translateY(0)',
                opacity: animateOut ? 0 : 1
            }}
            onClick={handleStart}
        >
            <img src="/logo_aiutiti.png" alt="AIutiti Logo" className="welcome-logo" />

            <div className="welcome-title">
                AIutiti
            </div>



            <button className="start-button" onClick={(e) => { e.stopPropagation(); handleStart(); }}>
                INIZIA
            </button>
        </div>
    );
};

export default WelcomeScreen;
