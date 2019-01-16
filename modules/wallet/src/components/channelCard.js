import React, {Component} from 'react';
import Card from '@material-ui/core/Card';
import CardActionArea from '@material-ui/core/CardActionArea';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';
import Button from '@material-ui/core/Button';
import RefreshIcon from '@material-ui/icons/Refresh';
import HelpIcon from '@material-ui/icons/Help';
import TextField from '@material-ui/core/TextField';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import PropTypes from 'prop-types';
import Switch from '@material-ui/core/Switch';
import Popover from '@material-ui/core/Popover';





class ChannelCard extends Component {
  state = {
    anchorEl: null,
  };

  handleClick = event => {
    console.log("click handled")
    this.setState({
      anchorEl: event.currentTarget,
    });
  };

  handleClose = () => {
    this.setState({
      anchorEl: null,
    });
  };
  
  render(){
    const { anchorEl } = this.state;
    const open = Boolean(anchorEl);

    const cardStyle = {
      card:{
        display:'flex',
        flexWrap:'wrap',
        flexBasis:'100%',
        flexDirection:'row',
        width: '80%',
        justifyContent:'center',
        padding: '1% 4% 4% 4%',
        backgroundColor:'#8E98A7',
        color:'white'

      },
      row:{
        width:'100%',
        justifyContent:'center',
        color:'white'
      },
      input:{
        width:'100%',
      },
      button:{
        width:'100%',
        height:'40px'
      },
      headerText:{
        paddingTop:'8px',
        marginLeft:'80px',
        marginRight:'80px',
        width:'30%',
        color:'white'
      },
      headerIcon:{
        width:'10%'
      },
      popover:{
        padding:'8px 8px 8px 8px'
      }
    }



    return (
      <Card style={cardStyle.card}>
          <Typography variant="h6" style={cardStyle.headerText}>Channel</Typography>
        <IconButton style={cardStyle.headerIcon} 
                    aria-owns={open ? 'simple-popper' : undefined}
                    aria-haspopup="true"
                    variant="contained"
                    onClick={this.handleClick}>
            <HelpIcon/>
        </IconButton>
        <Popover
            id="simple-popper"
            open={open}
            anchorEl={anchorEl}
            onClose={this.handleClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'center',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'center',
            }}
          >
            <Typography style={cardStyle.popover} >Refer to this section for information about <br/>your offchain balance.</Typography>
          </Popover>
        <Typography variant="h5" style={cardStyle.row}>ETH: {this.state.channelState ? this.state.channelState.balanceWeiUser : null} Wei</Typography>

        <Typography gutterBottom variant="h5" style={cardStyle.row}>TST: {this.state.channelState ? this.state.channelState.balanceTokenUser : null} Wei</Typography> 

        <Typography variant="h6" style={cardStyle.row}>Hub ETH: {this.state.channelState ? this.state.channelState.balanceWeiHub : null} Wei </Typography>    

        <Typography variant="h6" style={cardStyle.row}>Hub TST: {this.state.channelState ? this.state.channelState.balanceTokenHub : null} Wei</Typography>   
      </Card>
    );
  };
}

export default ChannelCard;

