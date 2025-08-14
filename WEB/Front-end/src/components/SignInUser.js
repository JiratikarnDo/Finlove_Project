import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from 'react-router-dom'; 
import LogoImage from './assets/logofinlove.png'; // ใช้โลโก้ที่คุณให้มา

const defaultTheme = createTheme();

export default function SignInUser() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate(); 

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(process.env.REACT_APP_BASE_URL + '/login',
        {
          username,
          password
        }
      );

      const result = response.data;
      alert(result['message']);

      if (result['status'] === true) {
        localStorage.setItem('token', result['token']);
        if (result['role'] === 'admin') {
          navigate('/dashboard'); 
        } else if (result['role'] === 'employee') {
          navigate('/dashboard'); 
        } else {
          navigate('/cusview'); 
        }
      }

    } catch (err) {
      console.log(err);
    }
  }

  return (
    <ThemeProvider theme={defaultTheme}>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: '#FEF7FF', // สีพื้นตามที่คุณต้องการ
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 2,
        }}
      >
        <Container component="main" maxWidth="xs">
          <CssBaseline />
          <Box
            sx={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%', // เพิ่มความกว้างให้เต็มหน้าจอ
            }}
          >
            {/* โลโก้ */}
            <Avatar 
              sx={{ 
                m: 1, 
                width: 120, 
                height: 120, 
                borderRadius: '10px' // ปรับให้เป็นสี่เหลี่ยมขอบมน 10px
              }} 
              src={LogoImage} 
            />

            <Typography component="h1" variant="h4" sx={{ fontWeight: 'bold', mb: 2 }}>
              FINLOVE
            </Typography>

            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
              {/* Username */}
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                InputProps={{
                  style: {
                    borderRadius: '10px', // ขอบมน 10px ตามที่ต้องการ
                    borderColor: '#ccc',
                    borderWidth: '2px',
                    padding: '0.1px',
                    width: '100%', // ปรับขนาดให้เต็มความกว้าง
                  },
                }}
                InputLabelProps={{
                  style: {
                    color: 'black',
                  },
                }}
                sx={{
                  backgroundColor: 'white',
                  mb: 2,
                  boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)', // เพิ่มเงาให้ช่องกรอก
                  borderRadius: '10px', // ขอบมน 10px
                  width: '100%', // ปรับความกว้างของช่องกรอก
                }}
              />

              {/* Password */}
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  style: {
                    borderRadius: '10px', // ขอบมน 10px
                    borderColor: '#ccc',
                    borderWidth: '2px',
                    padding: '0.1px',
                    width: '100%', // ปรับขนาดให้เต็มความกว้าง
                  },
                }}
                InputLabelProps={{
                  style: {
                    color: 'black',
                  },
                }}
                sx={{
                  backgroundColor: 'white',
                  mb: 2,
                  boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)', // เพิ่มเงาให้ช่องกรอก
                  borderRadius: '10px', // ขอบมน 10px
                  width: '100%', // ปรับความกว้างของช่องกรอก
                }}
              />

              {/* ปุ่มเข้าสู่ระบบ */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ 
                  mt: 3, 
                  mb: 2, 
                  backgroundColor: '#ff69b4', 
                  color: 'white', 
                  padding: '10px', // ทำให้ปุ่มผอมลง
                  borderRadius: '10px', // ขอบมน 10px
                  fontWeight: 'bold', 
                  fontSize: '18px',
                  width: '100%', // ปรับขนาดให้เต็มความกว้าง
                  boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.2)' // เพิ่มเงาให้ปุ่ม
                }}
              >
                เข้าสู่ระบบ
              </Button>

            </Box>
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
