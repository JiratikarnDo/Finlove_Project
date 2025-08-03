import { React, useState, useEffect } from "react";
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Avatar from '@mui/material/Avatar';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useParams, useNavigate } from 'react-router-dom';
import axios from "axios";
import BackgroundImage from '../../assets/BG.png';

const customTheme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    background: {
      default: '#f0f0f0',
      paper: '#ffffff',
    },
  },
  typography: {
    h4: {
      fontSize: '2rem',
      fontWeight: 'bold',
      color: '#333',
    },
    h6: {
      color: '#666',
    },
    body1: {
      fontSize: '1rem',
      color: '#333',
    },
  },
});

const token = localStorage.getItem('token');
const url = process.env.REACT_APP_BASE_URL;

export default function ViewEmployee() {
  const [employee, setEmployee] = useState({});
  const [reportHistory, setReportHistory] = useState([]);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${url}/employee/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    .then(response => {
      const employeeData = response.data;
      setEmployee(employeeData);
      setReportHistory(employeeData.reportHistory || []);
    })
    .catch(error => {
      console.error('Error fetching employee data:', error);
    });
  }, [id]);

  const handleUpdateEmployee = () => {
    navigate(`/admin/employee/update/${id}`);
  };

  return (
    <ThemeProvider theme={customTheme}>
      <Box sx={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', backgroundImage: `url(${BackgroundImage})`, backgroundSize: 'cover' }}>
        <Container maxWidth="md" sx={{ marginTop: 10, marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
          <Card sx={{ backgroundColor: '#fff', borderRadius: '15px', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)', padding: '30px', width: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" sx={{ mb: 3 }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => navigate(-1)}
                  sx={{ color: '#1976d2', fontWeight: 'bold', marginBottom: 1 }}
                >
                  ย้อนกลับ
                </Button>
              </Box>

              <Grid container spacing={4} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <Avatar
                    sx={{ width: 150, height: 150 }}
                    src={employee.imageFile ? `${url}/employee/image/${employee.imageFile}` : '/path/to/default-avatar.jpg'}
                  />
                </Grid>
                <Grid item xs={12} sm={8}>
                  <Typography variant="h4" gutterBottom>
                    {employee.firstname} {employee.lastname}
                  </Typography>
                  <Typography color="textSecondary" gutterBottom>
                    {employee.email}
                  </Typography>
                  <Typography color="textSecondary">
                    เพศ : {employee.gender === 1 ? "ชาย" : employee.gender === 2 ? "หญิง" : employee.gender === 3 ? "อื่นๆ" : "-"}
                  </Typography>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body1" gutterBottom>
                เบอร์โทร : {employee.phonenumber || "ไม่ระบุ"}
              </Typography>
              <Divider sx={{ my: 2 }} />
            </CardContent>
          </Card>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
