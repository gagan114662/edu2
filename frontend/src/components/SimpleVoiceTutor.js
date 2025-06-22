import React from 'react';
import useSimpleVoice from '../hooks/useSimpleVoice';
import { 
    Box, 
    Container, 
    Typography, 
    Button, 
    Paper, 
    List, 
    ListItem, 
    ListItemText,
    Alert,
    Chip,
    IconButton
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import DeleteIcon from '@mui/icons-material/Delete';

function SimpleVoiceTutor() {
    const {
        isListening,
        isConnected,
        transcript,
        error,
        toggleListening,
        disconnect,
        clearTranscript
    } = useSimpleVoice();

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Typography variant="h4" gutterBottom align="center">
                AI Voice Tutor
            </Typography>
            
            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}
            
            <Paper elevation={3} sx={{ p: 3, mb: 3, textAlign: 'center' }}>
                <Typography variant="h6" gutterBottom>
                    {isConnected ? 'Connected' : 'Not Connected'}
                </Typography>
                
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                    <Button
                        variant="contained"
                        size="large"
                        color={isListening ? 'secondary' : 'primary'}
                        startIcon={isListening ? <MicOffIcon /> : <MicIcon />}
                        onClick={toggleListening}
                    >
                        {isListening ? 'Stop Talking' : 'Start Talking'}
                    </Button>
                    
                    {isConnected && (
                        <Button
                            variant="outlined"
                            onClick={disconnect}
                        >
                            Disconnect
                        </Button>
                    )}
                </Box>
                
                {isListening && (
                    <Typography variant="body2" color="text.secondary">
                        Listening... Speak clearly into your microphone
                    </Typography>
                )}
            </Paper>
            
            <Paper elevation={2} sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                        Conversation
                    </Typography>
                    <IconButton onClick={clearTranscript} size="small">
                        <DeleteIcon />
                    </IconButton>
                </Box>
                
                {transcript.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" align="center">
                        No conversation yet. Click "Start Talking" to begin.
                    </Typography>
                ) : (
                    <List>
                        {transcript.map((entry, index) => (
                            <ListItem key={index} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                    <Chip 
                                        label={entry.speaker === 'user' ? 'You' : 'AI Tutor'} 
                                        size="small"
                                        color={entry.speaker === 'user' ? 'primary' : 'secondary'}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        {entry.timestamp}
                                    </Typography>
                                </Box>
                                <ListItemText 
                                    primary={entry.text}
                                    sx={{
                                        '& .MuiListItemText-primary': {
                                            fontSize: '0.95rem',
                                            lineHeight: 1.6
                                        }
                                    }}
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Paper>
            
            <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    <strong>Tips:</strong>
                    <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                        <li>Allow microphone access when prompted</li>
                        <li>Speak clearly and wait for the AI to respond</li>
                        <li>The AI will speak its responses aloud</li>
                        <li>Ask questions about any K-12 subject</li>
                    </ul>
                </Typography>
            </Box>
        </Container>
    );
}

export default SimpleVoiceTutor;