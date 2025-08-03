import './App.css';
import SignInUser from './components/SignInUser';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import AddEmployee from './components/AddEmployee';
import ManagePreferences from './components/admin/ManagePreferences';

import CustomerIndex from './components/admin/customer/Index';
import CustomerView from './components/admin/customer/View';
import CustomerUpdate from './components/admin/customer/Update';

import EmployeeIndex from './components/admin/employee/Index';
import EmployeeView from './components/admin/employee/View';
import EmployeeUpdate from './components/admin/employee/Update';


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/signinuser" />} /> 
        <Route exact path='/signinuser' element={<SignInUser />} />
        <Route exact path='/dashboard' element={<Dashboard />} />
        <Route exact path='/addemployee' element={<AddEmployee />} />
        <Route exact path='/managepreferences' element={<ManagePreferences />} />
        
        <Route exact path='/admin/user' element={<CustomerIndex/>}/> 
        <Route exact path='/admin/user/view/:id' element={<CustomerView/>}/>      
        <Route exact path='/admin/user/update/:id' element={<CustomerUpdate/>}/>

        <Route exact path='/admin/employee' element={<EmployeeIndex/>}/>
        <Route exact path='/admin/employee/view/:id' element={<EmployeeView/>}/>      
        <Route exact path='/admin/employee/update/:id' element={<EmployeeUpdate/>}/>
      </Routes>
    </Router>
  );
}

export default App;
